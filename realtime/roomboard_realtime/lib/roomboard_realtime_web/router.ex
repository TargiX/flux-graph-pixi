defmodule RoomboardRealtimeWeb.Router do
  use RoomboardRealtimeWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", RoomboardRealtimeWeb do
    pipe_through :api
  end

  scope "/", RoomboardRealtimeWeb do
    pipe_through :api

    get "/health", HealthController, :show
  end
end
