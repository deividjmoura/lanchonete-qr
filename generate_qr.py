import qrcode,os
os.makedirs('qr',exist_ok=True)
for n in range(1,13): qrcode.make(f'http://localhost:3000/mesa/{n}').save(f'qr/mesa-{n}.png')
print('QRs gerados em qr/')
