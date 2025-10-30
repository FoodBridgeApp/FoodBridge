Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Users\Tetra> # reset vars
PS C:\Users\Tetra> Remove-Variable BASE, r, json, cartId -ErrorAction SilentlyContinue
PS C:\Users\Tetra> $ErrorActionPreference = "Stop"
PS C:\Users\Tetra>
PS C:\Users\Tetra> # 0) Base + health
PS C:\Users\Tetra> $BASE = 'https://foodbridge-server-rv0a.onrender.com'
PS C:\Users\Tetra> iwr "$BASE/api/health"


StatusCode        : 200
StatusDescription : OK
Content           : {"ok":true,"status":"healthy","ts":1761804051872,"reqId":"410c27b6-3d67-4d03-9e5c-8b19d342c
                    3ec"}
RawContent        : HTTP/1.1 200 OK
                    Transfer-Encoding: chunked
                    Connection: keep-alive
                    CF-RAY: 9968b1db7b4e2af0-LAX
                    access-control-allow-credentials: true
                    referrer-policy: no-referrer
                    rndr-id: 241ea72f-b0af-4117
                    va...
Forms             : {}
Headers           : {[Transfer-Encoding, chunked], [Connection, keep-alive], [CF-RAY, 9968b1db7b4e2af0-LAX],
                    [access-control-allow-credentials, true]...}
Images            : {}
InputFields       : {}
Links             : {}
ParsedHtml        : mshtml.HTMLDocumentClass
RawContentLength  : 96



PS C:\Users\Tetra>
PS C:\Users\Tetra> # (optional) verify features are present in this deploy
PS C:\Users\Tetra> ($cfg = (iwr "$BASE/api/config").Content | ConvertFrom-Json).features


demoIngest       : True
emailEnabled     : True
cartApi          : True
templatedEmail   : True
cartEmailSummary : True
cartExportJson   : True



PS C:\Users\Tetra>
PS C:\Users\Tetra> # 1) Upsert a cart (this returns a fresh cartId)
PS C:\Users\Tetra> $upsert = @{
>>   userId = "christian"
>>   items  = @(@{ type="recipe"; title="Pesto Pasta" })
>> } | ConvertTo-Json -Depth 5
PS C:\Users\Tetra>
PS C:\Users\Tetra> $r    = iwr "$BASE/api/cart/upsert" -Method POST -ContentType "application/json" -Body $upsert
PS C:\Users\Tetra> $json = $r.Content | ConvertFrom-Json
PS C:\Users\Tetra> if (-not $json.ok) { $json | Format-List; throw "Upsert failed." }
PS C:\Users\Tetra>
PS C:\Users\Tetra> $cartId = $json.cart.cartId
PS C:\Users\Tetra> $cartId  # show it
christian-mhd0n73t
PS C:\Users\Tetra>
PS C:\Users\Tetra> # 2) Export JSON
PS C:\Users\Tetra> iwr "$BASE/api/cart/$cartId/export.json"


StatusCode        : 200
StatusDescription : OK
Content           : {"ok":true,"cart":{"cartId":"christian-mhd0n73t","userId":"christian","items":[{"id":"17618
                    04052409-9nhxky-0","type":"recipe","title":"Pesto
                    Pasta","sourceUrl":null,"durationSec":null,"addedAt":"2025-...
RawContent        : HTTP/1.1 200 OK
                    Transfer-Encoding: chunked
                    Connection: keep-alive
                    CF-RAY: 9968b1e09eb62af0-LAX
                    access-control-allow-credentials: true
                    referrer-policy: no-referrer
                    rndr-id: 443f266a-8aa4-45b3
                    va...
Forms             : {}
Headers           : {[Transfer-Encoding, chunked], [Connection, keep-alive], [CF-RAY, 9968b1e09eb62af0-LAX],
                    [access-control-allow-credentials, true]...}
Images            : {}
InputFields       : {}
Links             : {}
ParsedHtml        : mshtml.HTMLDocumentClass
RawContentLength  : 303



PS C:\Users\Tetra>
PS C:\Users\Tetra> # 3) Email summary
PS C:\Users\Tetra> $req = @{
>>   to      = "you@example.com"
>>   subject = "Your FoodBridge Cart (Summary)"
>> } | ConvertTo-Json
PS C:\Users\Tetra>
PS C:\Users\Tetra> iwr "$BASE/api/cart/$cartId/email-summary" -Method POST -ContentType "application/json" -Body $req


StatusCode        : 200
StatusDescription : OK
Content           : {"ok":true,"messageId":"<51eaf741-44f6-9df5-7ffd-ab849d10bce5@gmail.com>","accepted":["you@
                    example.com"],"rejected":[],"response":"250 2.0.0 OK  1761804053
                    98e67ed59e1d1-340509727e6sm1185412a91.1 - gs...
RawContent        : HTTP/1.1 200 OK
                    Transfer-Encoding: chunked
                    Connection: keep-alive
                    CF-RAY: 9968b1e1bf672af0-LAX
                    access-control-allow-credentials: true
                    referrer-policy: no-referrer
                    rndr-id: 60006378-6349-4835
                    va...
Forms             : {}
Headers           : {[Transfer-Encoding, chunked], [Connection, keep-alive], [CF-RAY, 9968b1e1bf672af0-LAX],
                    [access-control-allow-credentials, true]...}
Images            : {}
InputFields       : {}
Links             : {}
ParsedHtml        : mshtml.HTMLDocumentClass
RawContentLength  : 252



PS C:\Users\Tetra> $BASE = 'https://foodbridge-server-rv0a.onrender.com'
PS C:\Users\Tetra> $cartId  # should already be set from your earlier run; if not, run the upsert again
christian-mhd0n73t
PS C:\Users\Tetra>
PS C:\Users\Tetra> # 1) Export JSON
PS C:\Users\Tetra> iwr "$BASE/api/cart/$cartId/export.json"


StatusCode        : 200
StatusDescription : OK
Content           : {"ok":true,"cart":{"cartId":"christian-mhd0n73t","userId":"christian","items":[{"id":"17618
                    04052409-9nhxky-0","type":"recipe","title":"Pesto
                    Pasta","sourceUrl":null,"durationSec":null,"addedAt":"2025-...
RawContent        : HTTP/1.1 200 OK
                    Transfer-Encoding: chunked
                    Connection: keep-alive
                    CF-RAY: 9968b266bf8a2af0-LAX
                    access-control-allow-credentials: true
                    referrer-policy: no-referrer
                    rndr-id: 1ca9d85b-a8ff-4a3b
                    va...
Forms             : {}
Headers           : {[Transfer-Encoding, chunked], [Connection, keep-alive], [CF-RAY, 9968b266bf8a2af0-LAX],
                    [access-control-allow-credentials, true]...}
Images            : {}
InputFields       : {}
Links             : {}
ParsedHtml        : mshtml.HTMLDocumentClass
RawContentLength  : 303



PS C:\Users\Tetra>
PS C:\Users\Tetra> # 2) Email summary
PS C:\Users\Tetra> $req = @{
>>   to = "you@example.com"
>>   subject = "Your FoodBridge Cart (Summary)"
>> } | ConvertTo-Json
PS C:\Users\Tetra> iwr "$BASE/api/cart/$cartId/email-summary" -Method POST -ContentType "application/json" -Body $req


StatusCode        : 200
StatusDescription : OK
Content           : {"ok":true,"messageId":"<21f24d7b-17ae-f5ab-e8b0-8ae71b311d5e@gmail.com>","accepted":["you@
                    example.com"],"rejected":[],"response":"250 2.0.0 OK  1761804075
                    d9443c01a7336-29498e46664sm170515495ad.109 -...
RawContent        : HTTP/1.1 200 OK
                    Transfer-Encoding: chunked
                    Connection: keep-alive
                    CF-RAY: 9968b26798082af0-LAX
                    access-control-allow-credentials: true
                    referrer-policy: no-referrer
                    rndr-id: b2e2e29f-ccb0-4a2c
                    va...
Forms             : {}
Headers           : {[Transfer-Encoding, chunked], [Connection, keep-alive], [CF-RAY, 9968b26798082af0-LAX],
                    [access-control-allow-credentials, true]...}
Images            : {}
InputFields       : {}
Links             : {}
ParsedHtml        : mshtml.HTMLDocumentClass
RawContentLength  : 255



PS C:\Users\Tetra>
