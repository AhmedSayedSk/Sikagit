import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import reposRouter from './routes/repos';
import projectsRouter from './routes/projects';
import gitRouter from './routes/git';
import browseRouter from './routes/browse';
import aiRouter from './routes/ai';
import { errorHandler } from './middleware/errorHandler';

const PORT = process.env.PORT || 3001;

const app = express();
const httpServer = createServer(app);
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(s => s.trim());

const io = new SocketServer(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: ALLOWED_ORIGINS,
}));
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/v1/repos', reposRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/git', gitRouter);
app.use('/api/v1/browse', browseRouter);
app.use('/api/v1/ai', aiRouter);

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

// Socket.io
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('watch:repo', (repoPath: string) => {
    console.log(`[Socket] Watching repo: ${repoPath}`);
    socket.join(`repo:${repoPath}`);
  });

  socket.on('unwatch:repo', (repoPath: string) => {
    socket.leave(`repo:${repoPath}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[SikaGit] Server running on http://localhost:${PORT}`);
});

export { io };
