$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$alignRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$alignOut = Join-Path $alignRoot 'test-results\v9'
[IO.Directory]::CreateDirectory($alignOut) | Out-Null
$alignText = 'Hola Colombia. Hoy vamos a corregir los subtítulos de nuestro video. La música baja cuando habla la persona.'
$alignSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$alignVoice = $alignSynth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'es-ES' } | Select-Object -First 1
if (-not $alignVoice) { throw 'Se necesita una voz local española de Windows para esta muestra controlada.' }
$alignSynth.SelectVoice($alignVoice.VoiceInfo.Name)
$alignSynth.Rate = -1
$alignFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$alignWav = Join-Path $alignOut 'voz-espanol.wav'
$alignSynth.SetOutputToWaveFile($alignWav, $alignFormat)
$alignWordEvent = 'AutoSubsCO.Word.' + [guid]::NewGuid()
$alignEndEvent = 'AutoSubsCO.End.' + [guid]::NewGuid()
Register-ObjectEvent -InputObject $alignSynth -EventName SpeakProgress -SourceIdentifier $alignWordEvent | Out-Null
Register-ObjectEvent -InputObject $alignSynth -EventName SpeakCompleted -SourceIdentifier $alignEndEvent | Out-Null
$alignPoints = [Collections.Generic.List[object]]::new()
try {
 $alignSynth.SpeakAsync($alignText) | Out-Null
 $alignDeadline = [DateTime]::UtcNow.AddSeconds(30)
 $alignComplete = $false
 while (-not $alignComplete -and [DateTime]::UtcNow -lt $alignDeadline) {
  $alignEvent = Wait-Event -Timeout 1
  if (-not $alignEvent) { continue }
  if ($alignEvent.SourceIdentifier -eq $alignWordEvent) {
   $alignArgs = $alignEvent.SourceEventArgs
   $alignPoints.Add([ordered]@{ text=$alignArgs.Text; start=$alignArgs.AudioPosition.TotalSeconds; character=$alignArgs.CharacterPosition; count=$alignArgs.CharacterCount })
  }
  if ($alignEvent.SourceIdentifier -eq $alignEndEvent) { $alignComplete = $true }
  Remove-Event -EventIdentifier $alignEvent.EventIdentifier
 }
 if (-not $alignComplete) { throw 'La síntesis de la muestra no terminó.' }
} finally {
 Unregister-Event -SourceIdentifier $alignWordEvent -ErrorAction SilentlyContinue
 Unregister-Event -SourceIdentifier $alignEndEvent -ErrorAction SilentlyContinue
 $alignSynth.Dispose()
}
$alignReference = [ordered]@{ text=$alignText; voice=$alignVoice.VoiceInfo.Name; sampleRate=16000; provenance='Síntesis local de Windows y eventos SpeakProgress; referencia controlada, no voz humana'; points=$alignPoints }
[IO.File]::WriteAllText((Join-Path $alignOut 'voz-espanol-reference.json'), ($alignReference | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$alignReference | ConvertTo-Json -Depth 5
