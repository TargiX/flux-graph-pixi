defmodule RoomboardRealtimeWeb.ChannelCase do
  @moduledoc """
  Test helpers for Phoenix channels.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      @endpoint RoomboardRealtimeWeb.Endpoint

      import Phoenix.ChannelTest
      import RoomboardRealtimeWeb.ChannelCase
    end
  end
end
