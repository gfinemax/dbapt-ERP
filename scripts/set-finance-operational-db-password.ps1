[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRef = 'takwoubezzhxtjvxecpx'
$poolerHost = 'aws-1-ap-northeast-2.pooler.supabase.com'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$privateDirectory = Join-Path $repositoryRoot '.tmp-repos'
$targetFile = Join-Path $privateDirectory 'finance-operational-db.env'

New-Item -ItemType Directory -Path $privateDirectory -Force | Out-Null
$securePassword = Read-Host 'Supabase 운영 DB 비밀번호를 입력해줘 (화면에 표시되지 않음)' -AsSecureString
if ($securePassword.Length -eq 0) {
    throw '비밀번호가 입력되지 않았어.'
}

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $encodedPassword = [Uri]::EscapeDataString($plainPassword)
    $contents = @(
        "DBAPT_BACKUP_SOURCE_URL=`"postgresql://postgres.${projectRef}:${encodedPassword}@${poolerHost}:5432/postgres`""
        "DBAPT_BACKUP_PROJECT_REF=`"${projectRef}`""
        ''
    ) -join [Environment]::NewLine
    [IO.File]::WriteAllText($targetFile, $contents, [Text.UTF8Encoding]::new($false))
}
finally {
    $plainPassword = $null
    $encodedPassword = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

Write-Host "운영 DB 연결 파일을 준비했어: $targetFile"
Write-Host '비밀번호 값은 출력하지 않았어.'
