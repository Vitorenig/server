require('dotenv').config();
const express = require('express');
const cors = require('cors');
// A desestruturação correta para a v2 do SDK é { MercadoPagoConfig, Payment }
const { MercadoPagoConfig, Payment } = require('mercadopago'); 

const app = express();
const PORT = process.env.PORT || 4000;

// Garanta que a variável de ambiente do frontend está configurada no seu .env
const FRONTEND_URL = process.env.FRONTEND_URL;

// Habilita CORS apenas para o seu frontend
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

if (!process.env.MP_ACCESS_TOKEN) {
  console.error("ERRO CRÍTICO: A variável de ambiente MP_ACCESS_TOKEN não está definida.");
  process.exit(1);
}

// Inicializa o cliente do Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 },
});

// Cria uma instância de pagamento
const payment = new Payment(client);

// Endpoint para criar o pagamento
app.post('/api/create-payment', async (req, res) => {
  // req.body agora é o objeto formData vindo do Brick.
  const paymentData = req.body;

  // Validação com base nos dados que o Brick realmente envia.
  if (!paymentData.transaction_amount || !paymentData.payer?.email || !paymentData.payment_method_id) {
    return res.status(400).json({ error: 'Dados do pagamento incompletos.' });
  }

  try {
    // Corpo da requisição para a API do Mercado Pago
    const body = {
      transaction_amount: Number(paymentData.transaction_amount),
      description: 'Ingressos para evento', // Ou uma descrição mais dinâmica
      payment_method_id: paymentData.payment_method_id,
      payer: {
        email: paymentData.payer.email,
        first_name: paymentData.payer.firstName,
        last_name: paymentData.payer.lastName,
        identification: {
          type: paymentData.payer.identification.type,
          number: paymentData.payer.identification.number.replace(/\D/g, '')
        },
      },
      token: paymentData.token, // Usado para pagamentos com cartão
      installments: Number(paymentData.installments) || 1, // Usado para pagamentos com cartão
      issuer_id: paymentData.issuer_id, // Usado para pagamentos com cartão
    };

    const paymentResponse = await payment.create({ body });
    
    // Se for PIX, retorne os dados do QR Code para o frontend exibir
    if (paymentResponse.payment_method_id === 'pix') {
      const pixData = paymentResponse.point_of_interaction.transaction_data;
      return res.status(201).json({
        id: paymentResponse.id,
        status: paymentResponse.status,
        qrCodeImage: pixData.qr_code_base64,
        copyPasteCode: pixData.qr_code,
      });
    }

    // Para pagamentos com cartão, a resposta já é suficiente
    return res.status(201).json({
      id: paymentResponse.id,
      status: paymentResponse.status,
      status_detail: paymentResponse.status_detail,
    });

  } catch (error) {
    console.error('Erro ao criar pagamento:', error.cause || error);
    const message = error.cause?.[0]?.description || error.message || 'Ocorreu um erro interno ao processar o pagamento.';
    return res.status(400).json({ error: message });
  }
});


// Endpoint para verificar o status do pagamento (polling do PIX)
app.get('/api/payment-status/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const paymentDetails = await payment.get({ id });
        res.status(200).json({
            id: paymentDetails.id,
            status: paymentDetails.status,
            status_detail: paymentDetails.status_detail,
        });
    } catch (error) {
        console.error(`Erro ao consultar status do pagamento ${id}:`, error);
        const statusCode = error.status || 500;
        return res.status(statusCode).json({ error: 'Erro ao consultar status do pagamento.' });
    }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando e escutando na porta ${PORT}`);
});
