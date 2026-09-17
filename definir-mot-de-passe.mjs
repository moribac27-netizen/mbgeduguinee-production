const res = await fetch("https://vihzwddrggaaoevuendv.supabase.co/auth/v1/admin/users/e3a338a6-b760-436e-88c2-ef45f23ccc18", {
  method: "PUT",
  headers: {
    apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpaHp3ZGRyZ2dhYW9ldnVlbmR2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTYxODI0NywiZXhwIjoyMTAxMTk0MjQ3fQ.RNh9cHJwf-GAjyPmU3xABms7RuvZxHxMG7k9VBTBjW0",
    Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpaHp3ZGRyZ2dhYW9ldnVlbmR2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTYxODI0NywiZXhwIjoyMTAxMTk0MjQ3fQ.RNh9cHJwf-GAjyPmU3xABms7RuvZxHxMG7k9VBTBjW0",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ password: "test123456" }),
});
console.log(res.status, await res.text());