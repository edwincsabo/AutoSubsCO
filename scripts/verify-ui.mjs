import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'test-results'); await fs.mkdir(output, { recursive: true });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const packagedExe = process.env.AUTOSUBSCO_TEST_EXE;
if (packagedExe) env.AUTOSUBSCO_DATA = root;
const app = await electron.launch({ executablePath: packagedExe ?? path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: packagedExe ? [] : [root], env, timeout: 30000 });
let closed = false;
try {
  const page = await app.firstWindow(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('#model option', { state: 'attached' });
  await page.screenshot({ path: path.join(output, '01-inicio.png') });
  const ready = await page.evaluate(() => ({ title: document.title, models: document.querySelectorAll('#model option').length,
    tools: document.querySelector('#engine-status').textContent, generateDisabled: document.querySelector('#generate').disabled,
    overflow: document.documentElement.scrollWidth > window.innerWidth }));
  if (ready.models !== 5 || !ready.generateDisabled || ready.overflow) throw new Error(JSON.stringify(ready));
  const sourceProject = process.argv[2] ?? path.join(output, 'demo.autosubsco.json');
  const projectFile = path.join(output, 'ui-roundtrip.autosubsco.json');
  await fs.copyFile(sourceProject, projectFile);
  await app.evaluate(({ dialog }, projectFile) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [projectFile] });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: projectFile });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  }, projectFile);
  await page.locator('#open-project').click();
  await page.waitForFunction(() => document.querySelectorAll('.cue-row').length > 0 && !document.querySelector('#task-dialog').open);
  let transcriptionViaUi = false;
  if (process.env.AUTOSUBSCO_TEST_TRANSCRIBE === '1') {
    const previous = await page.evaluate(async () => (await window.autosubs.state()).project.transcription?.createdAt);
    await page.locator('#generate').click();
    await page.waitForFunction(async previous => {
      const state = await window.autosubs.state();
      return !state.busy && state.project?.transcription?.createdAt !== previous && !document.querySelector('#task-dialog').open;
    }, previous, { timeout: 60000 });
    transcriptionViaUi = true;
  }
  await page.locator('.cue-row').first().click();
  await page.waitForFunction(() => document.querySelector('#video').readyState >= 2);
  await page.screenshot({ path: path.join(output, '02-editor.png') });
  const originalText = await page.locator('#cue-text').inputValue();
  await page.locator('#cue-text').fill('Prueba de edición en Colombia & <texto>.');
  await page.locator('#save-project').click();
  await page.waitForFunction(() => document.querySelector('#dirty-indicator').textContent === 'Proyecto guardado');
  const saved = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  if (saved.cues[0].text !== 'Prueba de edición en Colombia & <texto>.') throw new Error('No se conservó el texto editado');
  const preview = await page.evaluate(() => ({ readyState: document.querySelector('#video').readyState,
    videoError: document.querySelector('#video').error?.message ?? null,
    fontSize: getComputedStyle(document.querySelector('#caption-overlay')).fontSize,
    editorVisible: document.querySelector('#cue-editor').getBoundingClientRect().bottom <= document.querySelector('.inspector').getBoundingClientRect().bottom + 1,
    textAsHtml: document.querySelector('#caption-overlay').querySelector('texto') !== null }));
  if (preview.videoError || !preview.editorVisible || preview.textAsHtml) throw new Error(JSON.stringify(preview));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1180, 860));
  await page.screenshot({ path: path.join(output, '04-ventana-minima.png') });
  const minimumFits = await page.evaluate(() => document.querySelector('#cue-editor').getBoundingClientRect().bottom <= document.querySelector('.inspector').getBoundingClientRect().bottom + 1 && document.documentElement.scrollWidth <= window.innerWidth);
  if (!minimumFits) throw new Error('El editor se recorta en el tamaño mínimo de ventana');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1500, 980));
  await page.locator('#cue-text').fill('Último cambio antes de cerrar.');
  const closeEvent = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closeEvent; closed = true;
  const afterClose = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  if (afterClose.cues[0].text !== 'Último cambio antes de cerrar.') throw new Error('Se perdió la última edición al cerrar');
  const summary = { passed: true, packaged: Boolean(packagedExe), transcriptionViaUi, ready, preview, minimumFits, openProject: true, saveProject: true, flushBeforeClose: true, errors };
  await fs.writeFile(path.join(output, 'ui-verification.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { if (!closed) await app.close().catch(() => {}); }
