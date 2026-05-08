// /api/properties.js

export default async function handler(req, res) {
  // Solo permitir GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.EASYBROKER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Construir query params para EasyBroker
    const {
      page = 1,
      limit = 20,
      search,
      min_price,
      max_price,
      property_type,
      location,
      operation_type
    } = req.query;

    const params = new URLSearchParams({
      page: String(page),
      limit: Math.min(Number(limit), 50).toString()
    });

    // Solo activas/publicadas (≈159 de 682). Permitir opt-out con ?include_disabled=1
    if (!req.query.include_disabled) {
      params.append('search[statuses][]', 'published');
    }

    if (search) params.append('search[query]', search);
    if (min_price) params.append('search[min_price]', String(min_price));
    if (max_price) params.append('search[max_price]', String(max_price));
    if (property_type) params.append('search[property_types][]', property_type);
    if (location) params.append('search[locations][]', location);
    if (operation_type) params.append('search[operation_type]', operation_type);

    // Llamar a EasyBroker API
    const response = await fetch(
      `https://api.easybroker.com/v1/properties?${params.toString()}`,
      {
        headers: {
          'X-Authorization': apiKey,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'EasyBroker API error',
        status: response.status
      });
    }

    const data = await response.json();

    // Enriquecimiento de coordenadas: el listado de EasyBroker NO incluye
    // latitude/longitude. Si el cliente lo pide explícitamente (?include_location=1)
    // hacemos fetch en paralelo del detalle de cada propiedad para extraer coords.
    // Costoso (N+1 calls), pero el cache CDN de 5 min absorbe la mayoría de hits.
    if (req.query.include_location === '1' && data.content && data.content.length > 0) {
      const enriched = await Promise.all(
        data.content.map(async (property) => {
          try {
            const dr = await fetch(
              `https://api.easybroker.com/v1/properties/${encodeURIComponent(property.public_id)}`,
              { headers: { 'X-Authorization': apiKey, 'Accept': 'application/json' } }
            );
            if (!dr.ok) return property;
            const detail = await dr.json();
            const lat = (detail.location && detail.location.latitude) ?? detail.latitude;
            const lng = (detail.location && detail.location.longitude) ?? detail.longitude;
            if (lat == null || lng == null) return property;
            return { ...property, latitude: lat, longitude: lng };
          } catch (e) {
            console.error('detail enrich failed for', property.public_id, e.message);
            return property;
          }
        })
      );
      const withCoords = enriched.filter(p => p.latitude != null && p.longitude != null).length;
      console.log(`Enriched ${withCoords}/${enriched.length} with coords`);
      data.content = enriched;
    }

    // Cache de 5 minutos en CDN de Vercel
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    return res.status(200).json(data);

  } catch (error) {
    console.error('Properties API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
