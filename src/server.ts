import express, { Request, Response } from "express";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";

const app = express();
app.use(express.static("uploads"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = `input-${file.fieldname}-${uniqueSuffix}.mp3`;
    cb(null, fileName);
  },
});
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("audio/")) {
      new Error("Only audio files are allowed");
      return cb(null, false);
    }
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

function extendAudio(
  inputFile: string,
  outputFile: string,
  targetDuration: number = 300
) {
  console.log(inputFile, "input");
  console.log(outputFile, "outpit");

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputFile, (err, metadata) => {
      if (err) return reject(`Error probing input file: ${err.message}`);
      const inputDuration = metadata.format.duration;
      if (!inputDuration)
        return reject("Could not determine input audio duration");

      const loopCount = Math.ceil(targetDuration / inputDuration);

      ffmpeg()
        .input(inputFile)
        .inputOptions([`-stream_loop ${loopCount - 1}`])
        .outputOptions([`-t ${targetDuration}`])
        .output(outputFile)
        .on("end", () => resolve("Success"))
        .on("error", (err) => reject(`Error: ${err.message}`))
        .run();
    });
  });
}

app.post(
  "/generate",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).send("No file uploaded");
      const min = Number(req.query.duration);
      const seconds = Math.round(min * 60);

      const inputAudio = `${req.file.path}`;
      const replaceFile = req.file.filename.replace("input-", "output-");
      const outputAudio = path.join(__dirname, "uploads", replaceFile);

      await extendAudio(inputAudio, outputAudio, seconds);
      res.sendFile(path.resolve(outputAudio), (err) => {
        // Optional cleanup
        fs.unlinkSync(inputAudio);
        fs.unlinkSync(outputAudio);
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || error });
    }
  }
);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
