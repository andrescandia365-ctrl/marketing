# IMAN

Frase: Números claros. Local que crece.
Tipo: Software (SaaS)
Estilo de texto: {"subtitleSize":100,"headlineSize":100,"textColor":"#ffffff","headlineColor":"#ffffff","backing":"shadow","backingColor":"#000000","font":"app","fontFamily":"","nameColor":"role","subtitlePosition":"bottom","headlinePosition":"top"}
Look (cámara y defectos, en todos los prompts): {"camera":"an early-2000s point-and-shoot digicam","flash":"harsh direct on-camera flash that flattens faces and puts sharp highlights on shiny surfaces","grain":"minor digital noise, warm slightly saturated CCD tones, bloom and halation at bright edges","focus":"slightly soft corners, focus a little off on fast moves","light":"the place's own light behind, underexposed against the flash; it never changes","extra":"skin with visible pores, freckles and fine texture, no smoothing, no retouching, no beauty filter"}
Marca (logo, colores y fuentes para motion graphics): {"bg":"#14130f","text":"#ebe4d4","accent":"#8eae8a","displayFont":"Fraunces","uiFont":"DM Sans","logo":"logo.png","motion":"even","fonts":[]}
Personaje de los explicativos: mica (Mica)

## Qué es
Una app de caja y gestión para kioscos y almacenes de Argentina. Se vende como un lector láser de código de barras más una licencia (12, 24 o 36 meses).

## Lo que existe hoy (solo esto se muestra como real)
- Vender en el mostrador escaneando; imprime el ticket.
- Stock, vencimientos y pedidos a proveedores.
- Comprar por bulto y vender por unidad (packs); devoluciones a clientes y a proveedores.
- Cerrar la caja con la planilla mensual; el dueño ve la ganancia del mes en una vista privada con PIN.
- Funciona sin internet; el botón "Sincronizar" sincroniza.
- Un celular que acompaña y revisa el local: Vender, Stock, Llegó (llegó el pedido), Vence (lo que está por vencer), Dueño. El celular nunca le cobra a los clientes.
- Varios locales en una misma cuenta.

## Cómo se trabaja hoy (sin la marca; la historia no inventa otras costumbres)
- El pedido se arma mirando la góndola: según cuántas unidades quedan (3, 4 o 20), el dueño o el encargado decide si pide o no.
- Cada proveedor tiene un horario de corte: después de esa hora no levanta pedidos.

## El loop de la serie (un paso por línea)
- Abrir el local
- Vender en el mostrador (escanear, ticket)
- Llega el pedido (Llegó)
- Revisar lo que vence (Vence)
- Pedirle a los proveedores antes del corte
- Cerrar la caja
- Sincronizar
- El dueño mira los números

## La historia que contamos
IMAN es un LOOP que alguien puede meter en su rutina diaria, y ese loop es el producto. El loop del día:
abrir el local → vender en el mostrador → llega el pedido ("Llegó") → revisar lo que vence ("Vence") → pedirle a los proveedores antes del corte → cerrar la caja → Sincronizar → el dueño mira los números.
Cada paso arregla un dolor.

## El Malo
El caos del local, personificado: el yogur que venció el martes, el corte del proveedor que se pasó por diez minutos, la caja que nunca cierra, el dueño que no puede tomarse un domingo.

## El Bueno
El loop mismo: tranquilo, confiable, la voz cuerda en el local caótico. No es un robot: es una rutina que funciona.

## Quién mira
Dueños y empleados de kioscos y almacenes de Argentina.

## Elenco fijo (personajes, lugares, productos y pantallas con imagen aprobada)
```json
[
 {
  "id": "pantalla-1",
  "name": "Pantalla real 1",
  "ref": "PantallaReal1",
  "kind": "screen",
  "identity": "",
  "note": "",
  "image": "",
  "sheet": "",
  "puppet": {
   "layers": []
  },
  "rig": {
   "file": "",
   "clips": {
    "idle": "",
    "walk": "",
    "turnL": "",
    "turnR": "",
    "point": ""
   }
  },
  "refs": [],
  "views": []
 },
 {
  "id": "mica",
  "name": "Mica",
  "ref": "Mica",
  "kind": "character",
  "identity": "24-year-old woman with light brown skin, dark brown eyes, black wavy hair tied back, medium build, wearing navy work jacket over gray shirt, dark blue jeans, simple silver stud earrings",
  "note": "",
  "image": "mica.png",
  "sheet": "16:9 reference sheet, plain flat mid-grey background, no text, no labels, no floor shadow, stylized 3D render soft rounded shapes matte clay texture gentle studio light from upper left, brand accent orange #ff5a36 details, readable at phone size. 24-year-old woman with light brown skin, dark brown eyes, black wavy hair tied back, medium build, wearing navy work jacket over gray shirt, dark blue jeans, simple silver stud earrings. Top row: full body front, three-quarter, side profile, back. Bottom row: face neutral, happy, surprised, worried and mouth shapes closed, A, O, E. Identical shapes and colours in every panel.",
  "puppet": {
   "layers": [
    {
     "file": "mica-p0-muthhio2.png",
     "role": "body",
     "pivot": null,
     "name": "young-woman-character-1.png · cuerpo",
     "place": null
    },
    {
     "file": "mica-p1-muthhio2.png",
     "role": "head",
     "pivot": null,
     "name": "young-woman-character-1.png · cabeza",
     "place": null
    }
   ]
  },
  "rig": {
   "file": "",
   "clips": {
    "idle": "",
    "walk": "",
    "turnL": "",
    "turnR": "",
    "point": ""
   }
  },
  "refs": [],
  "views": []
 }
]
```
