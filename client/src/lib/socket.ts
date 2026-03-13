import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      transports: ['websocket'],
      autoConnect: true,
    });
  }
  return socket;
}

export function watchRepo(repoPath: string) {
  getSocket().emit('watch:repo', repoPath);
}

export function unwatchRepo(repoPath: string) {
  getSocket().emit('unwatch:repo', repoPath);
}
