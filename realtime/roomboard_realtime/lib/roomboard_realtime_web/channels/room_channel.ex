defmodule RoomboardRealtimeWeb.RoomChannel do
  use Phoenix.Channel

  alias RoomboardRealtimeWeb.Presence

  @presence_ttl_ms 15_000

  @impl true
  def join("room:" <> room_id, payload, socket) do
    if valid_room_id?(room_id) do
      socket =
        socket
        |> assign(:room_id, room_id)
        |> assign(:focus, clean_string(payload["focus"], 120) || "canvas")
        |> assign(:x, clean_number(payload["x"]) || 0)
        |> assign(:y, clean_number(payload["y"]) || 0)

      send(self(), :after_join)

      {:ok, %{roomId: room_id}, socket}
    else
      {:error, %{reason: "invalid_room"}}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    {:ok, _ref} = track(socket)
    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end

  @impl true
  def handle_in("presence:update", payload, socket) do
    socket =
      socket
      |> assign(:focus, clean_string(payload["focus"], 120) || socket.assigns.focus)
      |> assign(:x, clean_number(payload["x"]) || socket.assigns.x)
      |> assign(:y, clean_number(payload["y"]) || socket.assigns.y)

    :ok = update_presence(socket)

    broadcast!(socket, "presence:update", presence_payload(socket))
    {:reply, {:ok, %{presence: presence_payload(socket)}}, socket}
  end

  def handle_in("room:event", payload, socket) when is_map(payload) do
    event =
      payload
      |> Map.take([
        "type",
        "clientId",
        "comment",
        "connection",
        "connectionId",
        "item",
        "itemId",
        "room"
      ])
      |> Map.put("roomId", socket.assigns.room_id)
      |> Map.put("sentAt", now_ms())

    broadcast!(socket, "room:event", event)
    {:reply, {:ok, event}, socket}
  end

  def handle_in(_event, _payload, socket),
    do: {:reply, {:error, %{reason: "unsupported_event"}}, socket}

  defp track(socket) do
    Presence.track(socket, socket.assigns.user_id, presence_payload(socket))
  end

  defp update_presence(socket) do
    case Presence.update(socket, socket.assigns.user_id, presence_payload(socket)) do
      {:ok, _ref} -> :ok
      {:error, {:nopresence, _pid, _topic, _key}} -> track_presence_after_reconnect(socket)
    end
  end

  defp track_presence_after_reconnect(socket) do
    case track(socket) do
      {:ok, _ref} -> :ok
      {:error, {:already_tracked, _pid, _topic, _key}} -> :ok
    end
  end

  defp presence_payload(socket) do
    %{
      id: socket.assigns.user_id,
      name: socket.assigns.name,
      color: socket.assigns.color,
      focus: socket.assigns.focus,
      x: socket.assigns.x,
      y: socket.assigns.y,
      updatedAt: now_ms(),
      expiresAt: now_ms() + @presence_ttl_ms
    }
  end

  defp valid_room_id?(room_id) do
    String.match?(room_id, ~r/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,96}$/)
  end

  defp clean_string(nil, _max), do: nil

  defp clean_string(value, max) when is_binary(value) do
    value
    |> String.trim()
    |> String.slice(0, max)
    |> case do
      "" -> nil
      value -> value
    end
  end

  defp clean_string(_value, _max), do: nil

  defp clean_number(value) when is_number(value), do: value
  defp clean_number(_value), do: nil

  defp now_ms, do: System.system_time(:millisecond)
end
