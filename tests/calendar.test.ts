// Idea 60: the series' calendar moments, read in Spanish, with their next date from a fixed "today".
import assert from "node:assert/strict";
import { test } from "node:test";
import { inDays, momentLine, momentsForWriter, readMoment, upcomingMoments } from "../shared/calendar.ts";
import { EMPTY_SERIES, markdownToSeries, seriesToMarkdown } from "../shared/series.ts";

// Friday 9 October 2026.
const today = new Date(2026, 9, 9);
const next = (line: string) => readMoment(line, today).next;

test("dates written the way people write them", () => {
  assert.equal(next("15/10: vuelta del feriado"), "2026-10-15");
  assert.equal(next("1/3: vuelven las clases"), "2027-03-01");
  assert.equal(next("el 25 de diciembre: Navidad"), "2026-12-25");
  assert.equal(next("9 de octubre: hoy mismo"), "2026-10-09");
  assert.equal(next("primera semana de junio: primer frío"), "2027-06-01");
  // A week that has begun and not ended is today; a week that has not begun is its first day.
  assert.equal(next("segunda semana de octubre: liquidación"), "2026-10-09");
  assert.equal(next("tercera semana de octubre: feria"), "2026-10-15");
  assert.equal(next("primera semana de octubre: ya pasó"), "2027-10-01");
  assert.equal(next("octubre: todo el mes"), "2026-10-09");
});

test("months, weeks and the end of the month", () => {
  assert.equal(next("última semana de octubre: cierre"), "2026-10-25");
  assert.equal(next("mediados de noviembre: aguinaldo cerca"), "2026-11-11");
  assert.equal(next("principios de enero: vacaciones"), "2027-01-01");
  assert.equal(next("julio: vacaciones de invierno"), "2027-07-01");
  assert.equal(next("fin de mes: se cierra la caja"), "2026-10-31");
  assert.equal(next("el 1 de cada mes: cobran los sueldos"), "2026-11-01");
  assert.equal(next("cada 10: vence el alquiler"), "2026-10-10");
  assert.equal(next("el 31 del mes: cierre"), "2026-10-31");
});

test("weekdays, every week or one in the month", () => {
  assert.equal(next("todos los lunes: llega el proveedor"), "2026-10-12");
  assert.equal(next("los viernes: feria"), "2026-10-09");
  assert.equal(next("los jueves: feria"), "2026-10-15");
  assert.equal(next("cada sábado: más gente"), "2026-10-10");
  assert.equal(next("día de inventario (último viernes del mes): contar todo"), "2026-10-30");
  assert.equal(next("primer lunes de cada mes: reunión"), "2026-11-02");
});

test("a moment without a known date stays, without a date", () => {
  const m = readMoment("cuando sube la nafta: todo aumenta", today);
  assert.equal(m.next, null);
  assert.equal(m.days, null);
  assert.equal(m.what, "todo aumenta");
  assert.equal(readMoment("primer frío", today).what, "primer frío");
});

test("the nearest first, the undated at the end", () => {
  const list = upcomingMoments(["cuando llueve: menos gente", "el 1 de cada mes: cobran", "los viernes: feria", "25 de diciembre: Navidad", ""], today);
  assert.deepEqual(
    list.map((m) => [m.when, m.days]),
    [
      ["los viernes", 0],
      ["el 1 de cada mes", 23],
      ["25 de diciembre", 77],
      ["cuando llueve", null],
    ],
  );
  assert.equal(inDays(0), "hoy");
  assert.equal(inDays(1), "mañana");
  assert.equal(inDays(23), "en 23 días");
  assert.match(momentsForWriter(["el 1 de cada mes: cobran"], today), /"el 1 de cada mes: cobran" \(in 23 days\)/);
  assert.equal(momentsForWriter([], today), "");
});

test("the moments live in the series bible and come back", () => {
  const fields = { ...EMPTY_SERIES, name: "Prueba", moments: ["el 1 de cada mes: cobran los sueldos", "los lunes: llega el proveedor"] };
  const md = seriesToMarkdown(fields);
  assert.match(md, /## Momentos del calendario/);
  assert.deepEqual(markdownToSeries(md, "prueba").moments, fields.moments);
  // A bible written before the section existed reads as no moments.
  assert.deepEqual(markdownToSeries("# Vieja\n\n## Qué es\nUna serie.\n", "vieja").moments, []);
});

test("what is not a date stays without one, and a line is read as it was meant", () => {
  // Days that no month has, and a range of hours, are not dates; 29 February is.
  assert.equal(next("31/2: nunca"), null);
  assert.equal(next("30 de febrero: tampoco"), null);
  assert.equal(next("18/20 hs: happy hour"), null);
  assert.equal(next("29/2: año bisiesto"), "2027-02-28");
  assert.equal(next("los sábados 18/20 hs: happy hour"), "2026-10-10");
  // An interval is not a day of the month; "cada 10" is.
  assert.equal(next("cada 15 días: llega el camión"), null);
  assert.equal(next("cada 2 semanas: reunión"), null);
  assert.equal(next("cada 10: vence la tarjeta"), "2026-10-10");
  assert.equal(next("el 40 de cada mes: no existe"), null);
  // A clock time keeps its colon; the line splits at the next one.
  const clock = readMoment("los viernes 18:30: after office", today);
  assert.equal(clock.when, "los viernes 18:30");
  assert.equal(clock.what, "after office");
  assert.equal(clock.next, "2026-10-09");
  // The first of the month, written with its ordinal, is a date.
  assert.equal(next("1.º de mayo: Día del Trabajador"), "2027-05-01");
  assert.equal(next("1° de noviembre: arranca la temporada"), "2026-11-01");
});

test("bullets go, the date stays, and a moment written twice is one", () => {
  assert.equal(momentLine("- 15/10: vuelta del feriado"), "15/10: vuelta del feriado");
  assert.equal(momentLine("• fin de mes: cierre"), "fin de mes: cierre");
  assert.equal(momentLine("1.º de mayo: Día del Trabajador"), "1.º de mayo: Día del Trabajador");
  const list = upcomingMoments(["15/10: feria", "- 15/10: feria", "  15/10: feria  ", "", "fin de mes: cierre"], today);
  assert.deepEqual(
    list.map((m) => m.line),
    ["15/10: feria", "fin de mes: cierre"],
  );
});
