import { spawn } from 'node:child_process';

const commands = [
  { name: 'api', command: process.execPath, args: ['server/index.js'] },
  { name: 'web', command: process.execPath, args: ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'] },
];

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on('exit', (code) => {
    if (code && !shuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
});

let shuttingDown = false;

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function shutdown(code) {
  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
}
