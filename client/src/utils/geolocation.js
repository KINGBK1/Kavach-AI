const cache = new Map();

const normalizeKey = (lat, lng) => `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;

export const lookUpLocationName = async (lat, lng) => {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return null;
  }

  const key = normalizeKey(lat, lng);
  if (cache.has(key)) {
    return cache.get(key);
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "10");
    url.searchParams.set("addressdetails", "0");
    url.searchParams.set("accept-language", "en");

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Reverse geocode failed: ${response.status}`);
    }

    const data = await response.json();
    const location = data?.display_name || data?.name || null;
    const label = location ? location.split(",").slice(0, 3).join(", ") : null;

    cache.set(key, label);
    return label;
  } catch (error) {
    console.warn("Reverse geocode lookup failed:", error);
    cache.set(key, null);
    return null;
  }
};
