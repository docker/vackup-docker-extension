package handler

import (
	"context"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	volumetypes "github.com/docker/docker/api/types/volume"
	"github.com/felipecruz91/vackup-docker-extension/internal/backend"
	"github.com/labstack/echo"
	"github.com/stretchr/testify/require"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"runtime"
	"testing"
)

func TestCloneVolume(t *testing.T) {
	var containerID string
	volume := "e6b2874a1b4ced2344d53b75e93346f60e1c363fe3e4cd9c6cb5bd8b975b9a45"
	destVolume := volume + "-cloned"
	cli := setupDockerClient(t)

	defer func() {
		_ = cli.ContainerRemove(context.Background(), containerID, types.ContainerRemoveOptions{
			Force: true,
		})
		_ = cli.VolumeRemove(context.Background(), volume, true)
		_ = cli.VolumeRemove(context.Background(), destVolume, true)
	}()

	// Setup
	e := echo.New()
	q := make(url.Values)
	q.Set("destVolume", destVolume)
	req := httptest.NewRequest(http.MethodPost, "/?"+q.Encode(), nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetPath("/volumes/:volume/clone")
	c.SetParamNames("volume")
	c.SetParamValues(volume)
	h := New(c.Request().Context(), setupDockerClient(t))

	// Create volume
	_, err := cli.VolumeCreate(c.Request().Context(), volumetypes.VolumeCreateBody{
		Driver: "local",
		Name:   volume,
	})
	if err != nil {
		t.Fatal(err)
	}

	reader, err := cli.ImagePull(c.Request().Context(), "docker.io/library/nginx:1.21", types.ImagePullOptions{
		Platform: "linux/" + runtime.GOARCH,
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = io.Copy(os.Stdout, reader)
	if err != nil {
		t.Fatal(err)
	}

	// Populate volume
	resp, err := cli.ContainerCreate(c.Request().Context(), &container.Config{
		Image: "docker.io/library/nginx:1.21",
	}, &container.HostConfig{
		Binds: []string{
			volume + ":" + "/usr/share/nginx/html:ro",
		},
	}, nil, nil, "")
	if err != nil {
		t.Fatal(err)
	}

	containerID = resp.ID

	// Clone volume
	err = h.CloneVolume(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, rec.Code)

	// Check volume has been cloned and contains the expected data
	clonedVolumeResp, err := h.DockerClient.VolumeList(context.Background(), filters.NewArgs(filters.Arg("name", destVolume)))
	if err != nil {
		t.Fatal(err)
	}
	require.Len(t, clonedVolumeResp.Volumes, 1)
	sizes := backend.GetVolumesSize(context.Background(), h.DockerClient, destVolume)
	require.Equal(t, int64(16000), sizes[destVolume].Bytes)
	require.Equal(t, "16.0 kB", sizes[destVolume].Human)
}
