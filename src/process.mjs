import { spawn } from 'node:child_process';

export function run(executable, args, { cwd, signal, onStderr, onStdout, maxOutput = 8_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Operación cancelada.')); return; }
    const child = spawn(executable, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => { stdout = (stdout + d).slice(-maxOutput); onStdout?.(d); });
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-maxOutput); onStderr?.(d); });
    const done = (err, value) => { if (settled) return; settled = true; signal?.removeEventListener('abort', abort); err ? reject(err) : resolve(value); };
    child.on('error', e => done(new Error(`No se pudo ejecutar ${executable}: ${e.message}`)));
    child.on('close', code => {
      if (signal?.aborted) done(new Error('Operación cancelada.'));
      else if (code !== 0) done(new Error(`El proceso terminó con código ${code}.\n${stderr.slice(-2400) || stdout.slice(-2400)}`));
      else done(null, { stdout, stderr });
    });
  });
}
