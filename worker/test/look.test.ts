import { describe, expect, it } from "vitest";
import { allowedSource, imageRows, parseSesame, trimToImage } from "../src/routes/look";
import { json, makeClient } from "./helpers";

const FILE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level2/2025W23_1C/l2b-v20-2025-251/1/level2_2025W23_1C_0164_1D1_spx_l2b-v20-2025-251.fits";
const SIA_CSV = [
  "obs_id,access_url,t_min,t_max,em_min,em_max,dataproduct_type",
  `x,${FILE},60828.926,60828.928,7.5e-07,1.1e-06,image`,
  `y,${FILE},60828.926,60828.928,7.5e-07,1.1e-06,image`,
  "z,https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level3/deep.fits,60800,60801,7.5e-07,1.1e-06,image",
].join("\n");

describe("look", () => {
  it("reads SIA rows: level 2 files only, each once, sorted by time", () => {
    const rows = imageRows(SIA_CSV);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ detector: 1, obs_id: "2025W23_1C_0164_1", wavelength_um_range: [0.75, 1.1], archive_url: FILE });
  });

  it("lists images through SIA", async () => {
    const { get, calls } = makeClient({ upstream: () => new Response(SIA_CSV) });
    const res = await get("/api/look/images?ra_deg=269.45&dec_deg=4.69");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.n_images).toBe(1);
    expect(body.searched).toContain("SIA");
    expect(calls[0]).toContain("irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_dr1");
  });

  it("falls back to TAP when SIA has nothing", async () => {
    const tap = "uri,time_bounds_lower,energy_bounds_lower,energy_bounds_upper\n" + `${FILE},60828.9,7.5e-07,1.1e-06`;
    const { get, calls } = makeClient({
      upstream: (url) => (url.pathname.startsWith("/SIA") ? new Response("access_url,t_min\n") : new Response(tap)),
    });
    const body = await json(await get("/api/look/images?ra_deg=1&dec_deg=2"));
    expect(body.n_images).toBe(1);
    expect(body.searched).toBe("IRSA TAP");
    expect(calls.some((c) => c.includes("/TAP/sync"))).toBe(true);
  });

  it("only proxies SPHEREx files on IRSA", () => {
    expect(allowedSource(FILE)).toBe(true);
    expect(allowedSource("https://evil.example/ibe/data/spherex/a.fits")).toBe(false);
    expect(allowedSource(`${FILE}?center=1,2`)).toBe(false);
    expect(allowedSource("https://irsa.ipac.caltech.edu/TAP/sync")).toBe(false);
  });

  it("proxies a cutout and caches it", async () => {
    const fits = new TextEncoder().encode("SIMPLE  =                    T".padEnd(2880, " "));
    const { get, calls, settle } = makeClient({ upstream: () => new Response(fits) });
    const path = `/api/look/cutout?src=${encodeURIComponent(FILE)}&ra_deg=269.45&dec_deg=4.69`;
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/fits");
    expect((await res.arrayBuffer()).byteLength).toBe(2880);
    expect(calls[0]).toContain("?center=269.450000,4.690000&size=0.1");
    await settle();
    await get(path);
    expect(calls).toHaveLength(1);
  });

  it("trims a cutout to its primary header and IMAGE extension", () => {
    const card = (k: string, v: string) => `${k.padEnd(8)}= ${v.padStart(20)}`.padEnd(80);
    const hdu = (cards: string[], dataBytes: number) => {
      const head = [...cards, "END".padEnd(80)].join("").padEnd(2880, " ");
      return head + "\0".repeat(Math.ceil(dataBytes / 2880) * 2880);
    };
    const file =
      hdu([card("SIMPLE", "T"), card("BITPIX", "8"), card("NAXIS", "0")], 0) +
      hdu([card("XTENSION", "'IMAGE   '"), card("BITPIX", "-32"), card("NAXIS", "2"), card("NAXIS1", "59"), card("NAXIS2", "59"), card("EXTNAME", "'IMAGE   '")], 59 * 59 * 4) +
      hdu([card("XTENSION", "'BINTABLE'"), card("BITPIX", "8"), card("NAXIS", "2"), card("NAXIS1", "1000"), card("NAXIS2", "1000"), card("EXTNAME", "'EPSF    '")], 1e6);
    const buf = new TextEncoder().encode(file).buffer as ArrayBuffer;
    const out = trimToImage(buf)!;
    expect(out.byteLength).toBe(2880 + 2880 + Math.ceil((59 * 59 * 4) / 2880) * 2880);
  });

  it("rejects an error page in place of a FITS file", async () => {
    const { get } = makeClient({ upstream: () => new Response("<html>error</html>") });
    const res = await get(`/api/look/cutout?src=${encodeURIComponent(FILE)}&ra_deg=1&dec_deg=1`);
    expect(res.status).toBe(502);
  });

  it("resolves names through Sesame", async () => {
    const xml =
      "<Sesame><Target><Resolver name='S=Simbad'><oname>NAME Barnard's Star</oname><jradeg>269.45207695</jradeg>" +
      "<jdedeg>+04.69336497</jdedeg><pm><v>10393</v><pmRA>-802.803</pmRA><pmDE>10362.542</pmDE></pm></Resolver></Target></Sesame>";
    expect(parseSesame(xml)).toMatchObject({ name: "Barnard's Star", ra_deg: 269.45207695, pm_dec_mas_yr: 10362.542 });
    const { get } = makeClient({ upstream: () => new Response(xml) });
    const body = await json(await get("/api/look/resolve?name=Barnard%27s%20Star"));
    expect(body).toMatchObject({ name: "Barnard's Star", pm_ra_mas_yr: -802.803, epoch_year: 2000 });
    const none = makeClient({ upstream: () => new Response("<Sesame><Target><INFO>*** Nothing found ***</INFO></Target></Sesame>") });
    expect((await none.get("/api/look/resolve?name=zzz")).status).toBe(404);
  });
});
