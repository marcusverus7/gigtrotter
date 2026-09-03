/**
 * The nightly Ticketmaster sweep: UK + Ireland cities with a real gig
 * circuit. ~43 cities x up to 3 pages each stays comfortably inside the
 * free tier (5,000 calls/day) and the run's own 400-call cap.
 */
export type SweepCity = {
  name: string;
  lat: number;
  lng: number;
  /** ISO 3166 alpha-2, for Ticketmaster's countryCode filter. */
  country: "GB" | "IE";
};

export const SWEEP_CITIES: SweepCity[] = [
  { name: "London", lat: 51.5074, lng: -0.1278, country: "GB" },
  { name: "Manchester", lat: 53.4808, lng: -2.2426, country: "GB" },
  { name: "Birmingham", lat: 52.4862, lng: -1.8904, country: "GB" },
  { name: "Leeds", lat: 53.8008, lng: -1.5491, country: "GB" },
  { name: "Glasgow", lat: 55.8642, lng: -4.2518, country: "GB" },
  { name: "Edinburgh", lat: 55.9533, lng: -3.1883, country: "GB" },
  { name: "Liverpool", lat: 53.4084, lng: -2.9916, country: "GB" },
  { name: "Bristol", lat: 51.4545, lng: -2.5879, country: "GB" },
  { name: "Newcastle", lat: 54.9783, lng: -1.6178, country: "GB" },
  { name: "Sheffield", lat: 53.3811, lng: -1.4701, country: "GB" },
  { name: "Nottingham", lat: 52.9548, lng: -1.1581, country: "GB" },
  { name: "Cardiff", lat: 51.4816, lng: -3.1791, country: "GB" },
  { name: "Belfast", lat: 54.5973, lng: -5.9301, country: "GB" },
  { name: "Brighton", lat: 50.8225, lng: -0.1372, country: "GB" },
  { name: "Leicester", lat: 52.6369, lng: -1.1398, country: "GB" },
  { name: "Southampton", lat: 50.9097, lng: -1.4044, country: "GB" },
  { name: "Portsmouth", lat: 50.8198, lng: -1.088, country: "GB" },
  { name: "Oxford", lat: 51.752, lng: -1.2577, country: "GB" },
  { name: "Cambridge", lat: 52.2053, lng: 0.1218, country: "GB" },
  { name: "Norwich", lat: 52.6309, lng: 1.2974, country: "GB" },
  { name: "Hull", lat: 53.7676, lng: -0.3274, country: "GB" },
  { name: "Aberdeen", lat: 57.1497, lng: -2.0943, country: "GB" },
  { name: "Dundee", lat: 56.462, lng: -2.9707, country: "GB" },
  { name: "Inverness", lat: 57.4778, lng: -4.2247, country: "GB" },
  { name: "Swansea", lat: 51.6214, lng: -3.9436, country: "GB" },
  { name: "Exeter", lat: 50.7184, lng: -3.5339, country: "GB" },
  { name: "Plymouth", lat: 50.3755, lng: -4.1427, country: "GB" },
  { name: "Bath", lat: 51.3811, lng: -2.359, country: "GB" },
  { name: "York", lat: 53.9591, lng: -1.0815, country: "GB" },
  { name: "Coventry", lat: 52.4068, lng: -1.5197, country: "GB" },
  { name: "Derby", lat: 52.9225, lng: -1.4746, country: "GB" },
  { name: "Stoke-on-Trent", lat: 53.0027, lng: -2.1794, country: "GB" },
  { name: "Middlesbrough", lat: 54.5742, lng: -1.2349, country: "GB" },
  { name: "Sunderland", lat: 54.9069, lng: -1.3838, country: "GB" },
  { name: "Wolverhampton", lat: 52.5862, lng: -2.1288, country: "GB" },
  { name: "Reading", lat: 51.4543, lng: -0.9781, country: "GB" },
  { name: "Milton Keynes", lat: 52.0406, lng: -0.7594, country: "GB" },
  { name: "Bournemouth", lat: 50.7192, lng: -1.8808, country: "GB" },
  { name: "Dublin", lat: 53.3498, lng: -6.2603, country: "IE" },
  { name: "Cork", lat: 51.8985, lng: -8.4756, country: "IE" },
  { name: "Galway", lat: 53.2707, lng: -9.0568, country: "IE" },
  { name: "Limerick", lat: 52.6638, lng: -8.6267, country: "IE" },
  { name: "Derry", lat: 54.9966, lng: -7.3086, country: "GB" },
];
