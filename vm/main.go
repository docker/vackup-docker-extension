package main

import (
	"context"
	"flag"
	"net"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/docker/docker/client"
	"github.com/felipecruz91/vackup-docker-extension/internal/handler"
	"github.com/felipecruz91/vackup-docker-extension/internal/log"
	"github.com/labstack/echo"
	"github.com/labstack/echo/middleware"
	"github.com/sirupsen/logrus"
)

var (
	h *handler.Handler
)

func main() {
	var socketPath string
	flag.StringVar(&socketPath, "socket", "/run/guest/ext.sock", "Unix domain socket to listen on")
	flag.Parse()

	_ = os.RemoveAll(socketPath)

	// Output to stdout instead of the default stderr
	log.SetOutput(os.Stdout)

	router := echo.New()
	router.HideBanner = true
	router.Use(middleware.LoggerWithConfig(middleware.LoggerConfig{
		Skipper: middleware.DefaultSkipper,
		Format: `{"time":"${time_rfc3339_nano}","id":"${id}",` +
			`"host":"${host}","method":"${method}","uri":"${uri}","user_agent":"${user_agent}",` +
			`"status":${status},"error":"${error}","latency":${latency},"latency_human":"${latency_human}"` +
			`,"bytes_in":${bytes_in},"bytes_out":${bytes_out}}` + "\n",
		CustomTimeFormat: "2006-01-02 15:04:05.00000",
		Output:           os.Stdout,
	}))

	log.Infof("Starting listening on %s\n", socketPath)
	ln, err := net.Listen("unix", socketPath)
	if err != nil {
		log.Fatal(err)
	}
	router.Listener = ln

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatal(err)
	}

	h = handler.New(context.Background(), cli)

	router.GET("/progress", h.ActionsInProgress)
	router.GET("/volumes", h.Volumes)
	router.GET("/volumes/:volume/size", h.VolumeSize)
	router.GET("/volumes/:volume/export", h.ExportVolume)
	router.GET("/volumes/:volume/import", h.ImportTarGzFile)
	router.GET("/volumes/:volume/save", h.SaveVolume)
	router.GET("/volumes/:volume/load", h.LoadImage)
	router.POST("/volumes/:volume/push", h.PushVolume)
	router.POST("/volumes/:volume/pull", h.PullVolume)

	// Start server
	go func() {
		if err := router.Start(""); err != nil && err != http.ErrServerClosed {
			log.Fatal("shutting down the server")
		}
	}()

	// Wait for interrupt signal to gracefully shut down the server with a timeout of 10 seconds.
	// Use a buffered channel to avoid missing signals as recommended for signal.Notify
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)
	<-quit
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := router.Shutdown(ctx); err != nil {
		logrus.Fatal(err)
	}
}
