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
      params.append('search[search_disabled]', 'false');
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

    // (Filtro public_url removido temporalmente — investigar filtro correcto)

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
