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

    // Pedimos 4x el limit pedido (capado a 50, máx de EasyBroker) para
    // compensar las propiedades sin public_url que se filtran después.
    const params = new URLSearchParams({
      page: String(page),
      limit: Math.min(Number(limit) * 4, 50).toString()
    });

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

    // Filtrar solo propiedades publicadas (con public_url no nulo)
    if (data.content && Array.isArray(data.content)) {
      const totalBeforeFilter = data.content.length;

      data.content = data.content.filter(property => {
        return property.public_url && property.public_url !== null;
      });

      const filteredCount = data.content.length;

      if (data.pagination) {
        data.pagination.filtered_total = filteredCount;
        data.pagination.original_total = totalBeforeFilter;
      }

      console.log(`Filtered: ${filteredCount} of ${totalBeforeFilter} properties`);
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
