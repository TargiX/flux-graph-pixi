defmodule RoomboardRealtimeWeb.UserSocket do
  use Phoenix.Socket

  channel "room:*", RoomboardRealtimeWeb.RoomChannel

  @impl true
  def connect(params, socket, _connect_info) do
    user_id = clean_string(params["id"] || params["user_id"] || params["userId"], 72)
    name = clean_string(params["name"], 24) || "Visitor"
    color = clean_color(params["color"]) || "#48a7ff"

    socket =
      socket
      |> assign(:user_id, user_id || random_id())
      |> assign(:name, name)
      |> assign(:color, color)

    {:ok, socket}
  end

  @impl true
  def id(socket), do: "roomboard:#{socket.assigns.user_id}"

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

  defp clean_color("#" <> hex = color) when byte_size(hex) == 6 do
    if String.match?(color, ~r/^#[0-9a-fA-F]{6}$/), do: color
  end

  defp clean_color(_value), do: nil

  defp random_id do
    16
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
  end
end
