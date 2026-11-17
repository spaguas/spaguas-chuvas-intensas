// Coordinate transcription only: restores apostrophe/backtick DMS variants missed by the initial importer.
// Existing non-null coordinates and all equation coefficients/versions remain untouched.
const coordinates = [
  [
    "3505104",
    -21.2675,
    -49.94222222222222
  ],
  [
    "3506359",
    -23.766666666666666,
    -46.11666666666667
  ],
  [
    "3508009",
    -23.8,
    -48.583333333333336
  ],
  [
    "3508504",
    -23.133333333333333,
    -45.75
  ],
  [
    "3512100",
    -20.239166666666666,
    -48.652499999999996
  ],
  [
    "3515129",
    -21.833055555555557,
    -51.47972222222222
  ],
  [
    "3518008",
    -19.88,
    -50.42055555555555
  ],
  [
    "3521903",
    -21.311111111111114,
    -49.05722222222222
  ]
];
export async function up(knex) {
  for (const [id, latitude, longitude] of coordinates) {
    await knex('municipalities').where({ id }).whereNull('latitude').whereNull('longitude').update({ latitude, longitude });
  }
}
export async function down(knex) {
  for (const [id, latitude, longitude] of coordinates) await knex('municipalities').where({ id, latitude, longitude }).update({ latitude: null, longitude: null });
}
