# Panduan Deploy WiFi Coverage ke Vercel

Repository ini memiliki dua aplikasi:
- `frontend` = React CRA
- `backend` = FastAPI + MongoDB

Keduanya sebaiknya dibuat sebagai dua Vercel Project terpisah agar deployment mudah dan tetap gratis untuk penggunaan pribadi/non-komersial sesuai ketentuan Hobby Vercel.

## 1. Backend
Import repository ke Vercel, pilih Root Directory `backend`.

Build/entrypoint menggunakan `server.py` melalui `backend/vercel.json`.

Environment:
```
MONGO_URL=...
DB_NAME=...
JWT_SECRET=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
FRONTEND_URL=https://URL-FRONTEND.vercel.app
CORS_ORIGINS=https://URL-FRONTEND.vercel.app
SEED_GIS_ON_STARTUP=true
```

Deploy dan cek:
`https://URL-BACKEND.vercel.app/api`

## 2. Frontend
Buat project Vercel kedua dari repository yang sama.
Root Directory: `frontend`

Environment:
```
REACT_APP_BACKEND_URL=https://URL-BACKEND.vercel.app
```

Build command:
`yarn build`

Output directory:
`build`

Setelah deploy, direct URL seperti `/admin/login` dan `/t/nama-tenant` tetap diarahkan ke React melalui `frontend/vercel.json`.

## 3. Setelah GIS selesai
Jika 4 file seed sudah READY, ubah:
`SEED_GIS_ON_STARTUP=false`

Lalu redeploy backend.

## 4. Checklist
- Backend `/api` = OK
- Frontend landing = tampil
- Login admin berhasil
- Tenant isolation tetap aktif
- Upload/aktivasi KMZ/KML berhasil
- Cek coverage menghasilkan COVERED/NOT_COVERED
- Lead tersimpan hanya pada tenant terkait
- WhatsApp mengikuti nomor tenant
