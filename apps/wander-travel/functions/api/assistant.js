const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts = [];
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

export async function onRequestPost(context) {
  if (!context.env.OPENAI_API_KEY) {
    return json({ ok: false, error: 'OPENAI_API_KEY no está configurada en Cloudflare Pages.' }, 500);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'El cuerpo de la solicitud debe ser JSON válido.' }, 400);
  }

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const travelContext = body?.context && typeof body.context === 'object' ? body.context : {};

  if (!message) {
    return json({ ok: false, error: 'Falta el mensaje para Wander.' }, 400);
  }
  if (message.length > 3000) {
    return json({ ok: false, error: 'El mensaje es demasiado largo.' }, 413);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${context.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        store: false,
        max_output_tokens: 350,
        reasoning: { effort: 'low' },
        instructions: [
          'Sos Wander, un acompañante de viaje atento, espontáneo y breve.',
          'Respondé en español claro y natural.',
          'Usá el contexto del viaje solamente cuando sea relevante.',
          'No inventes datos sobre lugares, clima, horarios o distancias.',
          'Si falta información, decilo con naturalidad.',
          'No suenes como una alerta técnica ni como un chatbot genérico.',
          'Mantené la respuesta normalmente por debajo de 90 palabras.',
        ].join(' '),
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Contexto actual del viaje:\n${JSON.stringify(travelContext)}\n\nMensaje del usuario:\n${message}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await openAIResponse.json().catch(() => null);
    if (!openAIResponse.ok) {
      const detail = data?.error?.message || 'OpenAI rechazó la solicitud.';
      return json({ ok: false, error: detail }, openAIResponse.status);
    }

    const output = extractOutputText(data);
    if (!output) {
      return json({ ok: false, error: 'OpenAI no devolvió texto.' }, 502);
    }

    return json({ ok: true, message: output, response_id: data.id || null });
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return json({
      ok: false,
      error: timedOut ? 'La consulta a OpenAI tardó demasiado.' : 'No se pudo conectar con OpenAI.',
    }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function onRequest() {
  return json({ ok: false, error: 'Usá POST para consultar a Wander.' }, 405);
}
