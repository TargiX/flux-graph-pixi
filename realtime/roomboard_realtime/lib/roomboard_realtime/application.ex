defmodule RoomboardRealtime.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      RoomboardRealtimeWeb.Telemetry,
      {DNSCluster,
       query: Application.get_env(:roomboard_realtime, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: RoomboardRealtime.PubSub},
      RoomboardRealtimeWeb.Presence,
      # Start a worker by calling: RoomboardRealtime.Worker.start_link(arg)
      # {RoomboardRealtime.Worker, arg},
      # Start to serve requests, typically the last entry
      RoomboardRealtimeWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: RoomboardRealtime.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    RoomboardRealtimeWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
