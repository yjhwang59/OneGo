$ErrorActionPreference = 'Stop'

function Wait-Health($BaseUrl) {
  Write-Host "0) waiting for health: $BaseUrl/api/health"
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $h = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/health"
      if ($h.ok -eq $true) {
        Write-Host "health ok"
        return
      }
    } catch {
      Start-Sleep -Milliseconds 300
    }
  }
  throw "API health check timeout"
}

function PostJson($Url, $Headers, $Body) {
  return Invoke-RestMethod -Method POST -Uri $Url -Headers $Headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 20)
}

function PostEmptyJson($Url, $Headers) {
  return Invoke-RestMethod -Method POST -Uri $Url -Headers $Headers -ContentType 'application/json' -Body '{}'
}

function GetJson($Url, $Headers) {
  if ($null -eq $Headers) { return Invoke-RestMethod -Method GET -Uri $Url }
  return Invoke-RestMethod -Method GET -Uri $Url -Headers $Headers
}

$base = "http://localhost:3875"
Wait-Health $base

$orgAdmin = @{ 'x-user-id' = 'org-admin' }
$aliceH = @{ 'x-user-id' = 'alice' }
$bobH = @{ 'x-user-id' = 'bob' }

Write-Host "1) create organization"
$slug = "onego-test-" + ([Guid]::NewGuid().ToString('N').Substring(0, 6))
$org = PostJson "$base/api/organizations" $orgAdmin @{ name = 'OneGo Org'; slug = $slug }
$orgId = $org.id
Write-Host "orgId=$orgId slug=$slug"

Write-Host "2) create tournament"
$t = PostJson "$base/api/tournaments" $orgAdmin @{
  organizationId = $orgId
  name = 'Winter Cup'
  gameKey = 'go'
  rulesetVersion = 'v1'
  format = 'swiss'
  roundCount = 3
  startsAt = '2025-12-20T01:00:00Z'
  endsAt = '2025-12-20T09:00:00Z'
}
$tId = $t.id
Write-Host "tournamentId=$tId status=$($t.status)"

Write-Host "3) publish"
$pub = PostEmptyJson "$base/api/tournaments/$tId/events/publish" $orgAdmin
Write-Host "tournamentStatus=$($pub.status)"

Write-Host "4) register alice / bob (self-service)"
$rAlice = PostJson "$base/api/tournaments/$tId/registrations" $aliceH @{ userId = 'alice' }
$rBob = PostJson "$base/api/tournaments/$tId/registrations" $bobH @{ userId = 'bob' }
$rAliceId = $rAlice.id
$rBobId = $rBob.id
Write-Host "registrationAliceId=$rAliceId"
Write-Host "registrationBobId=$rBobId"

Write-Host "5) open check-in"
$chk = PostEmptyJson "$base/api/tournaments/$tId/events/open-checkin" $orgAdmin
Write-Host "tournamentStatus=$($chk.status)"

Write-Host "6) check-in both (organizer)"
$c1 = PostEmptyJson "$base/api/registrations/$rAliceId/checkin/events/check-in" $orgAdmin
$c2 = PostEmptyJson "$base/api/registrations/$rBobId/checkin/events/check-in" $orgAdmin
Write-Host "checkinAlice=$($c1.status)"
Write-Host "checkinBob=$($c2.status)"

Write-Host "7) lock for pairing"
$lock = PostEmptyJson "$base/api/tournaments/$tId/events/lock-for-pairing" $orgAdmin
Write-Host "tournamentStatus=$($lock.status)"

Write-Host "8) generate round 1"
$ms = PostJson "$base/api/tournaments/$tId/pairings/events/generate-round" $orgAdmin @{ roundNo = 1 }
if ($ms.Count -lt 1) { throw "no matches created" }
$matchId = $ms[0].id
Write-Host "matchId=$matchId"

Write-Host "9) start tournament"
$start = PostEmptyJson "$base/api/tournaments/$tId/events/start" $orgAdmin
Write-Host "tournamentStatus=$($start.status)"

Write-Host "10) submit match result (A wins by resign)"
$mres = PostJson "$base/api/matches/$matchId/result" $orgAdmin @{ result = @{ kind = 'win'; winner = 'A'; by = 'resign' } }
Write-Host "matchStatus=$($mres.status)"

Write-Host "11) standings (protected)"
$st = GetJson "$base/api/tournaments/$tId/standings" $orgAdmin
$st | ConvertTo-Json -Depth 10 | Write-Output

Write-Host "12) standings (public)"
$pst = GetJson "$base/api/public/tournaments/$tId/standings" $null
$pst | ConvertTo-Json -Depth 10 | Write-Output

Write-Host "13) alice me/registrations"
$meReg = GetJson "$base/api/me/registrations" $aliceH
$meReg | ConvertTo-Json -Depth 10 | Write-Output

Write-Host "14) alice me matches"
$meM = GetJson "$base/api/me/tournaments/$tId/matches" $aliceH
$meM | ConvertTo-Json -Depth 10 | Write-Output

Write-Host "15) generate round 2 (Swiss)"
$ms2 = PostJson "$base/api/tournaments/$tId/pairings/events/generate-round" $orgAdmin @{ roundNo = 2 }
if ($ms2.Count -lt 1) { throw "round 2: no matches created" }
$matchId2 = $ms2[0].id
Write-Host "round2MatchId=$matchId2"

Write-Host "16) submit round 2 result (B wins)"
$mres2 = PostJson "$base/api/matches/$matchId2/result" $orgAdmin @{ result = @{ kind = 'win'; winner = 'B'; by = 'resign' } }
Write-Host "matchStatus=$($mres2.status)"

Write-Host "17) standings after 2 rounds"
$st2 = GetJson "$base/api/tournaments/$tId/standings" $orgAdmin
$st2 | ConvertTo-Json -Depth 10 | Write-Output

Write-Host "OK: full MVP flow (incl. multi-round Swiss) finished."


