# Deploy Backend ke Vercel

Project Vercel backend menggunakan folder `backend` sebagai Root Directory.

## Environment Variables

Wajib:
- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Disarankan:
- `FRONTEND_URL` = URL Vercel frontend
- `CORS_ORIGINS` = URL frontend, tanpa trailing slash

Untuk import 4 file GIS bawaan saat database masih kosong:
- `SEED_GIS_ON_STARTUP=true`

Setelah 4 file sudah berhasil ter-import dan berstatus READY, ubah:
- `SEED_GIS_ON_STARTUP=false`

## Health Check

Setelah deploy:
- `GET /api` harus mengembalikan JSON status OK.

## Catatan

Database harus MongoDB Atlas atau MongoDB yang dapat diakses internet. Vercel tidak menyediakan database MongoDB bawaan untuk aplikasi ini.
