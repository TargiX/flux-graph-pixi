defmodule RoomboardRealtimeWeb.HealthController do
  use RoomboardRealtimeWeb, :controller

  def show(conn, _params) do
    json(conn, %{
      ok: true,
      service: "roomboard_realtime"
    })
  end
end
