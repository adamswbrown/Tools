import express from 'express';
import path from 'path';
import fs from 'fs';
import { Simulator } from './simulator';

const app = express();
const PORT = process.env.PORT || 3456;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve output files for download
app.use('/output', express.static(path.join(__dirname, '..', 'output')));

app.post('/api/simulate', async (req, res) => {
  const { apiKey, url, instructions, width, height } = req.body;

  if (!apiKey || !url || !instructions) {
    res.status(400).json({ error: 'Missing required fields: apiKey, url, instructions' });
    return;
  }

  // Set up streaming response
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');

  const sendProgress = (data: Record<string, unknown>) => {
    try {
      res.write(JSON.stringify(data) + '\n');
    } catch {}
  };

  try {
    const simulator = new Simulator(apiKey, (progress) => {
      sendProgress({ type: 'progress', ...progress });
    });

    const videoPath = await simulator.run(
      url,
      instructions,
      width || 1280,
      height || 720
    );

    // Build download URL from the video path
    const relativePath = path.relative(
      path.join(__dirname, '..', 'output'),
      videoPath
    );

    // Check if mp4 exists, otherwise use webm
    let downloadUrl: string;
    if (fs.existsSync(videoPath)) {
      downloadUrl = `/output/${relativePath}`;
    } else {
      const webmPath = videoPath.replace('.mp4', '.webm');
      const webmRelative = path.relative(
        path.join(__dirname, '..', 'output'),
        webmPath
      );
      downloadUrl = `/output/${webmRelative}`;
    }

    sendProgress({
      type: 'done',
      downloadUrl,
      message: 'Video ready for download!',
    });

    res.end();
  } catch (error) {
    sendProgress({
      type: 'error',
      message: (error as Error).message,
    });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Mouse Video Simulator running at http://localhost:${PORT}`);
});
