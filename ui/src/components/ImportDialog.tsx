import React, { useContext, useState } from "react";
import {
  Alert,
  Backdrop,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { createDockerDesktopClient } from "@docker/extension-api-client";

import { useCreateVolume } from "../hooks/useCreateVolume";
import { useImportFromPath } from "../hooks/useImportFromPath";
import { ImageAutocomplete } from "./ImageAutocomplete";
import { useImportFromImage } from "../hooks/useImportFromImage";
import { MyContext } from "..";
import { VolumeOrInput } from "./VolumeOrInput";

const ddClient = createDockerDesktopClient();

interface Props {
  open: boolean;
  onClose(v: boolean): void;
  volumes: unknown[];
}

export default function ImportDialog({ volumes, open, onClose }: Props) {
  const [fromRadioValue, setFromRadioValue] = useState<"file" | "image">(
    "file"
  );
  const [image, setImage] = useState<string>("");
  const [volumeName, setVolumeName] = useState("");
  const [volumeHasError, setVolumeHasError] = useState(false);
  const [path, setPath] = useState<string>("");

  // when executed from a Volume context we don't need to create it.
  const context = useContext(MyContext);
  const selectedVolumeName = context.store.volume?.volumeName;

  const { createVolume, isInProgress: isCreating } = useCreateVolume();
  const { importVolume, isInProgress: isImportingFromPath } =
    useImportFromPath();
  const { loadImage, isInProgress: isImportingFromImage } =
    useImportFromImage();

  const selectImportTarGzFile = () => {
    ddClient.desktopUI.dialog
      .showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: ".tar.gz", extensions: ["tar.gz"] }], // should contain extension without wildcards or dots
      })
      .then((result) => {
        if (result.canceled) {
          return;
        }

        setPath(result.filePaths[0]);
      });
  };

  const handleCreateVolume = async () => {
    if (selectedVolumeName) return;
    await createVolume(volumeName);
  };

  const createAndImport = async () => {
    await handleCreateVolume();
    if (fromRadioValue === "file") {
      await importVolume({
        volumeName: selectedVolumeName || volumeName,
        path,
      });
      onClose(true);
    } else {
      await loadImage({
        volumeName: selectedVolumeName || volumeName,
        imageName: image,
      });
      onClose(true);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFromRadioValue(
      (event.target as HTMLInputElement).value as "file" | "image"
    );
  };

  const renderFormControlFile = () => {
    return (
      <>
        <FormControlLabel value="file" control={<Radio />} label="Local file" />
        {fromRadioValue === "file" && (
          <Stack pt={1} pb={2} pl={4}>
            <Typography pb={1} variant="body2">
              Select a file (.tar.gz) whose content is to be imported into the{" "}
              {selectedVolumeName ? "existing" : "new"} volume.
            </Typography>
            <Grid container alignItems="center" gap={2}>
              <Grid item flex={1}>
                <TextField
                  fullWidth
                  disabled
                  label={path ? "" : "File name"}
                  value={path}
                  onClick={selectImportTarGzFile}
                />
              </Grid>
              <Button
                size="large"
                variant="outlined"
                onClick={selectImportTarGzFile}
              >
                Select file
              </Button>
            </Grid>
          </Stack>
        )}
      </>
    );
  };

  const renderImageRadioButton = () => {
    return (
      <>
        <FormControlLabel
          value="image"
          control={<Radio />}
          label="Local image"
        />
        {fromRadioValue === "image" && (
          <Stack pt={1} pb={2} pl={4} width="100%">
            <Typography pb={1} variant="body2">
              Select an image whose content is to be imported into the new
              volume.
            </Typography>
            <ImageAutocomplete
              value={image}
              onChange={(v) => setImage(v as any)}
            />
          </Stack>
        )}
      </>
    );
  };

  return (
    <Dialog fullWidth maxWidth="sm" open={open} onClose={onClose}>
      <DialogTitle>
        {selectedVolumeName ? "Import content" : "Import into a new volume"}
      </DialogTitle>
      <DialogContent>
        <Backdrop
          sx={{
            backgroundColor: "rgba(245,244,244,0.4)",
            zIndex: (theme) => theme.zIndex.drawer + 1,
          }}
          open={isCreating || isImportingFromPath || isImportingFromImage}
        >
          <CircularProgress color="info" />
        </Backdrop>
        <Stack>
          {selectedVolumeName && (
            <Alert
              sx={(theme) => ({ marginBottom: theme.spacing(2) })}
              severity="warning"
            >
              Any existing data inside the volume will be replaced.
            </Alert>
          )}
          <FormControl>
            <FormLabel id="from-label">
              <Typography variant="h3" mb={1}>
                From:
              </Typography>
            </FormLabel>
            <RadioGroup
              aria-labelledby="from-label"
              defaultValue="female"
              name="radio-buttons-group"
              value={fromRadioValue}
              onChange={handleChange}
            >
              {renderFormControlFile()}
              {renderImageRadioButton()}
            </RadioGroup>
          </FormControl>

          <FormControl>
            <FormLabel id="to-label">
              <Typography variant="h3" mt={3} mb={1}>
                To:
              </Typography>
            </FormLabel>
            <VolumeOrInput
              value={volumeName}
              hasError={volumeHasError}
              setHasError={setVolumeHasError}
              onChange={setVolumeName}
              volumes={volumes}
            />
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          variant="outlined"
          onClick={() => {
            setPath("");
            onClose(false);
          }}
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={createAndImport}
          disabled={Boolean(
            (fromRadioValue === "file" && !path) ||
              (fromRadioValue === "image" && !image) ||
              (volumeName && volumeHasError)
          )}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
