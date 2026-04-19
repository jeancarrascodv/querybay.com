# janium-v2

# test the api
`curl -v -X POST --location '127.0.0.1:3000/email' -H "Content-Type: application/json" --data '{"email_domain_id":"5d01a14d-39de-4e2d-8720-f4f3a27904ff","email":"ale@janium.com"}' --header 'Authorization: Bearer abc123'`

`curl -X GET --location '127.0.0.1:3000/email' -H "Content-Typr: application/json" --header 'Authorization: Bearer abc123'`