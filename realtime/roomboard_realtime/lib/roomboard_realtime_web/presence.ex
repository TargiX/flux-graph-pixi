defmodule RoomboardRealtimeWeb.Presence do
  @moduledoc """
  Phoenix Presence process for Roomboard collaborators.

  Each room channel tracks browser-local collaborators by their stable client id.
  The Next app can keep rendering Pixi independently; this process owns the
  production realtime presence fanout.
  """

  use Phoenix.Presence,
    otp_app: :roomboard_realtime,
    pubsub_server: RoomboardRealtime.PubSub
end
