# Lanchonete QR — V2

MVP local de pedidos por QR Code, pensado primeiro para celular.

## Fluxo do cliente
1. A mesa abre `/mesa/1`.
2. Escolhe o produto.
3. Personaliza adicionais, remoções, ponto da carne e observações.
4. Envia o pedido.
5. É levado automaticamente para `/pedido/ID`.
6. A tela acompanha o status a cada 2 segundos.

## Cozinha
Abra `/cozinha`. O painel existente do projeto continua sendo usado para mudar os pedidos entre os status.

## Instalação
Requer Node.js.
```bash
node server.js
```
Acesse http://localhost:3000

## Teste
- Cliente: http://localhost:3000/mesa/1
- Cozinha: http://localhost:3000/cozinha
- Admin/QR Codes: http://localhost:3000/admin

## Personalizações
Cada item pode ter:
- adicionais com preço;
- ingredientes removíveis;
- ponto da carne;
- observação livre do lanche;
- observação geral do pedido.

O servidor valida os adicionais e remoções contra o cardápio, em vez de confiar cegamente no valor enviado pelo navegador.
# lanchonete-qr
