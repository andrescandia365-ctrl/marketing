// The walk that already exists, plus this phase's metric CSVs. Later phases add their own walks.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { Page } from "playwright-core";
import { DEMO_MENU } from "../server/demo.ts";
import { REPO, openPage, startApp, type Running } from "./harness.ts";

let app: Running;

before(async () => {
  app = await startApp();
  const page = await openPage(app);
  await page.context().close();
}, { timeout: 180_000 });

after(async () => {
  await app?.stop();
});

function pcmWav(seconds = 0.4, rate = 8000): Buffer {
  const samples = Math.floor(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// The board arrives a moment after the story is approved, so a check that is not on screen yet is not "none".
async function approveWhenClear(page: Page, name: string) {
  const approve = page.getByRole("button", { name });
  await approve.waitFor();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await approve.isEnabled()) {
      await approve.click();
      return;
    }
    const left = page.getByRole("button", { name: "No es un problema" });
    if ((await left.count()) > 0) await left.first().click();
    else await page.waitForTimeout(200);
  }
  const pending = await page.getByText(/Check ·/).allInnerTexts();
  throw new Error(`«${name}» sigue bloqueado.\n${pending.join("\n")}`);
}

function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.length > 0));
}

describe("recorrido de la app", { concurrency: 1 }, () => {
  test("Playbook: un pegado inválido, uno válido, y el ejemplo hasta producción", async () => {
    const page = await openPage(app);
    try {
      const box = page.getByRole("textbox", { name: "Pegá la respuesta de claude.ai (el menú de temas)" });
      await box.fill('{"ideas":"seis","questions":[]}');
      await page.getByRole("button", { name: "Usar esta respuesta" }).click();
      const alert = page.getByRole("alert");
      await alert.waitFor();
      const message = await alert.innerText();
      assert.match(message, /La respuesta pegada no tiene la forma que espera la app/);
      assert.match(message, /«ideas» tendría que ser una lista/);

      await box.fill(JSON.stringify(DEMO_MENU));
      await page.getByRole("button", { name: "Usar esta respuesta" }).click();
      await page.getByRole("button", { name: /Quedarse sin mercadería a la tarde/ }).click();
      await page.getByRole("button", { name: "Ver un ejemplo", exact: true }).click();
      await approveWhenClear(page, "Aprobar → storyboard de ejemplo");
      const panel = page.getByRole("region", { name: "Elementos del gancho" }).first();
      await panel.getByRole("button", { name: "+ Agregar elemento" }).click();
      await panel.getByLabel("Qué se ve, en inglés").fill("a bubblegum-pink handheld microphone with glitter, no logo");
      await panel.getByLabel("Nombre corto").fill("Micrófono rosa");
      await panel.getByLabel("Por qué frena").fill("El rosa chicle corta el scroll.");
      await panel.getByLabel("Cómo se ata al dolor").fill("Es el objeto del reclamo de la mercadería.");
      await panel.getByLabel("Dónde").selectOption("center");
      await panel.getByRole("button", { name: "Agregar", exact: true }).click();
      await panel.getByText("a bubblegum-pink handheld microphone with glitter, no logo").waitFor();
      await page.getByText("Ver detalles").first().click();
      await page.getByText(/bubblegum-pink/).first().waitFor();
      await approveWhenClear(page, "Aprobar → producción");
      await page.getByRole("button", { name: "5 · Producción" }).click();
      await page.getByRole("button", { name: "Enviar a Publicidad (hook)" }).waitFor();
    } finally {
      await page.context().close();
    }
  });

  test("Brief en Abajo: el ejemplo avisa que falta una prueba o una oferta real", async () => {
    const page = await openPage(app);
    try {
      await page.getByRole("button", { name: /abajo, Decidir/ }).click();
      await page.getByRole("button", { name: "Ver un ejemplo", exact: true }).click();
      await page.getByRole("button", { name: /Quedarse sin mercadería a la tarde/ }).click();
      await page.getByRole("button", { name: "Ver un ejemplo", exact: true }).click();
      await page.getByText(/falta una prueba confirmada o una oferta real/).waitFor();
    } finally {
      await page.context().close();
    }
  });

  test("un explicativo de ejemplo muestra la vista previa, los checks y la portada", async () => {
    const page = await openPage(app);
    try {
      await page.getByRole("button", { name: "Explicativo (motion graphics)" }).click();
      await page.getByRole("button", { name: "Empezar un explicativo" }).click();
      await page.getByRole("button", { name: "Ver un ejemplo", exact: true }).click();
      await page.getByLabel("Vista previa del explicativo: tocá un elemento y arrastralo para moverlo").waitFor();
      await page.getByText(/Se lee:|Cada texto se queda lo suficiente para leerlo/).first().waitFor();
      await page.getByLabel("Portada").waitFor();
      await page.getByText("Portada (el primer cuadro del video)").waitFor();
      await page.getByRole("button", { name: "Reproducir con sonido" }).click();
      await page.getByRole("button", { name: /Pausa/ }).click();
    } finally {
      await page.context().close();
    }
  });

  test("Publicidad: dos voces, una tanda de 2 anuncios y los CSV de Meta y TikTok", async () => {
    const page = await openPage(app);
    page.on("dialog", (dialog) => dialog.accept());
    const voices = [join(app.root, "voz-una.wav"), join(app.root, "voz-dos.wav")];
    await writeFile(voices[0], pcmWav());
    await writeFile(voices[1], pcmWav());
    try {
      await page.getByRole("button", { name: "Publicidad", exact: true }).click();
      await page.getByRole("button", { name: /Traer de la serie/ }).click();
      await page.getByRole("textbox", { name: /^Promesa / }).fill("El pedido de mañana queda armado antes del corte.");
      await page.getByRole("button", { name: "Guardar perfil" }).click();
      await page.getByText("Guardado ✓").waitFor();
      await page.getByRole("button", { name: "6 s", exact: true }).click();

      await page.getByRole("button", { name: "1 · Hooks" }).click();
      await page.getByRole("spinbutton", { name: /Cantidad/ }).fill("1");
      await page.getByRole("button", { name: "Ver un ejemplo", exact: true }).click();
      await page.getByRole("button", { name: "Sí", exact: true }).click();
      await page.getByRole("button", { name: "Producción", exact: true }).click();
      await page.locator('input[type=file][multiple][accept*="audio"]').setInputFiles(voices);
      await page.getByText("Voces (2/10)").waitFor();

      await page.getByRole("button", { name: "2 · Meats" }).click();
      await page.getByRole("spinbutton", { name: /Cantidad/ }).fill("1");
      await page.getByRole("button", { name: "Ver un ejemplo", exact: true }).click();
      await page.getByRole("button", { name: "Sí", exact: true }).click();

      await page.getByRole("button", { name: "3 · CTAs" }).click();
      await page.getByRole("spinbutton", { name: /Cantidad/ }).fill("1");
      await page.getByRole("button", { name: "Ver un ejemplo", exact: true }).click();
      await page.getByRole("button", { name: "Sí", exact: true }).click();

      await page.getByRole("button", { name: "4 · Combinar" }).click();
      await page.getByRole("button", { name: "Renderizar 2 anuncios" }).click();
      await page.getByText(/Listo:/).waitFor({ timeout: 150_000 });

      const batches = await readdir(join(app.ads, "iman", "anuncios"));
      const csvs: string[] = [];
      for (const batch of batches) {
        const path = join(app.ads, "iman", "anuncios", batch, "anuncios.csv");
        try {
          csvs.push(await readFile(path, "utf8"));
        } catch {
          // A batch folder without its CSV is not this run.
        }
      }
      assert.equal(csvs.length, 1);
      const table = parseCsv(csvs[0]);
      const head = table[0];
      const idAt = head.indexOf("id");
      const hookVoice = head.indexOf("voz_hook");
      const meatVoice = head.indexOf("voz_meat");
      const ctaVoice = head.indexOf("voz_cta");
      assert.ok(idAt >= 0 && hookVoice >= 0 && meatVoice >= 0 && ctaVoice >= 0);
      const ids = table.slice(1).map((row) => row[idAt]);
      assert.deepEqual(ids.sort(), ["IMAN_N1_H1v1-M1-C1_6s_9x16", "IMAN_N1_H1v2-M1-C1_6s_9x16"]);
      const said = table.slice(1).map((row) => row[hookVoice]).sort();
      assert.deepEqual(said, ["voz-dos.wav", "voz-una.wav"]);
      for (const row of table.slice(1)) {
        assert.equal(row[meatVoice], "");
        assert.equal(row[ctaVoice], "");
      }

      await page.getByRole("button", { name: "Fuentes" }).click();
      const min = page.getByRole("spinbutton", { name: "Mínimo de impresiones" });
      assert.equal(await min.inputValue(), "1000");
      const csvInput = page.locator('input[type=file][accept=".csv,text/csv"]');
      await csvInput.setInputFiles(join(REPO, "tests/fixtures/meta-en.csv"));
      await page.getByText("2 filas, 2 con ID de la app").waitFor();
      await page.getByText("1 fila es de otra serie y no entra.").waitFor();
      const ranked = page.locator("tr", { hasText: "H1" });
      await ranked.waitFor();
      const rankedText = await ranked.innerText();
      assert.match(rankedText, /2\.0k/);
      assert.doesNotMatch(rankedText, /sin datos suficientes/);

      await csvInput.setInputFiles(join(REPO, "tests/fixtures/meta-es.csv"));
      await page.getByText("1 filas, 1 con ID de la app").waitFor();
      await page.getByText("Cuando haya métricas, acá aparecen los hooks").waitFor();

      await csvInput.setInputFiles(join(REPO, "tests/fixtures/tiktok.csv"));
      await page.getByText("sin columna: views3s").waitFor();
      await page.getByText("Cuando haya métricas, acá aparecen los hooks").waitFor();
    } finally {
      await page.context().close();
    }
  });
});
