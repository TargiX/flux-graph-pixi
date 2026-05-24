defmodule RoomboardRealtimeWeb.HealthControllerTest do
  use RoomboardRealtimeWeb.ConnCase, async: true

  test "GET /health returns service status", %{conn: conn} do
    conn = get(conn, ~p"/health")

    assert %{
             "ok" => true,
             "service" => "roomboard_realtime"
           } = json_response(conn, 200)
  end
end
