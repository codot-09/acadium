# Telegram integratsiyasi: Acadium MVP arxitekturasi

## Tasdiqlangan texnik yo‘nalish

Telegram Mini Apps rasmiy hujjatiga ko‘ra, ilova `initData` orqali foydalanuvchi kontekstini qabul qilishi mumkin. Acadium bu ma’lumotni faqat server tomonda bot tokeni bilan tekshirgandan keyin qabul qiladi. Tekshirilgan `user.id`, `first_name`, `last_name` va `username` qiymatlari profil jadvaliga saqlanadi; shu sabab Web App ichida qo‘shimcha forma talab qilinmaydi.

Telegram Bot API rasmiy hujjatida bot yangilanishlarini HTTPS webhook manziliga qabul qilish uchun `setWebhook` qo‘llab-quvvatlanishi ko‘rsatilgan. Acadium bot handleri faqat Telegramdan kelgan maxfiy webhook sarlavhasini tekshirganidan so‘ng yangilanishlarni qayta ishlaydi. Bot tokeni server sirlarida saqlanadi va brauzerga uzatilmaydi.

## Ishlash modeli

| Qatlam | Vazifa | Xavfsizlik talabi |
| --- | --- | --- |
| Telegram Mini App | `initData`ni o‘qiydi va profiling endpointiga uzatadi | Telegram ichida bo‘lmagan preview uchun xavfsiz demo rejimi qo‘llanadi |
| Acadium backend | Imzoni tekshiradi, profil va chat tarixini saqlaydi, rol asosidagi API beradi | Bot tokeni va LLM kalitlari faqat serverda |
| Telegram webhook | Guruh va shaxsiy chatdagi update’larni qabul qiladi | Maxfiy webhook tokeni sarlavhasini tekshirish |
| Notification service | Topshiriq/session yaratishda tegishli chat IDlarga bot orqali xabar yuboradi | Faqat opt-in yoki ilgari botni ishga tushirgan foydalanuvchilarga yuborish |

## Ishga tushirishga bog‘liq tashqi qadamlar

Bot tokeni kiritilgach, production domenidagi `/api/telegram/webhook` manzili BotFather orqali webhook sifatida ro‘yxatdan o‘tkaziladi. Guruh sessionlarida botni administrator qilish, xabarlar huquqi va privacy mode sozlamalari guruhdagi kerakli eventlar ko‘rinishi uchun Telegram tomonida yakunlanadi.

## Manbalar

- Telegram Mini Apps: https://core.telegram.org/bots/webapps
- Telegram Bot API: https://core.telegram.org/bots/api


## Production sozlash checklisti

1. BotFather’da bot yarating yoki mavjud botni tanlang va tokenni Acadium Secrets bo‘limidagi `TELEGRAM_BOT_TOKEN` maydoniga kiriting.
2. Acadium Secrets bo‘limida tasodifiy, uzun `TELEGRAM_WEBHOOK_SECRET` qiymatini saqlang. Bu qiymat Telegram webhook so‘rovidagi `X-Telegram-Bot-Api-Secret-Token` sarlavhasi bilan bir xil bo‘lishi kerak.
3. Production domeningiz uchun webhook URL quyidagicha bo‘ladi: `https://YOUR_ACADIUM_DOMAIN/api/telegram/webhook`. BotFather yoki Telegram Bot API `setWebhook` metodi orqali URLni `secret_token` bilan ro‘yxatdan o‘tkazing.
4. Botni kerakli guruhga administrator qilib qo‘shing. Session xabarlarini yuborish, savollarni ko‘rish va o‘quvchi javoblarini qabul qilish uchun zarur guruh huquqlarini yoqing. Guruhdagi barcha xabarlarni ko‘rish talab qilinsa, BotFather’da privacy mode sozlamasini tekshiring.
5. Web App manzilini BotFather’da Mini App sifatida sozlang. Foydalanuvchi Mini App’ni Telegram ichida ochganda `initData` avtomatik tekshiriladi va chat ID, ism hamda username bazaga yoziladi.
6. Tekshiruv: `getWebhookInfo` orqali webhook manzilini va oxirgi xatoni ko‘ring; Acadium testlari `TELEGRAM_BOT_TOKEN`ni `getMe` orqali va webhook secret qoidalarini lokal test orqali tekshiradi.

Webhook secret majburiy: sarlavha yo‘q yoki noto‘g‘ri bo‘lgan so‘rovlar 401 bilan rad etiladi. Teacher roli ham serverda administrator tomonidan berilgan profil roli bilan cheklangan; oddiy foydalanuvchi UI tugmasi orqali o‘zini teacher qila olmaydi.
