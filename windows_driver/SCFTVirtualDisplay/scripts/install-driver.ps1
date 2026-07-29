param(
    [Parameter(Mandatory)]
    [string]$PackageDirectory,
    [string]$TestCertificatePath
)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window."
}

$directory = (Resolve-Path -LiteralPath $PackageDirectory).Path
$inf = Join-Path $directory "SCFTVirtualDisplayDriver.inf"
$dll = Join-Path $directory "SCFTVirtualDisplayDriver.dll"
$catalog = Join-Path $directory "scftvirtualdisplaydriver.cat"
if (-not (Test-Path -LiteralPath $inf) -or -not (Test-Path -LiteralPath $dll) -or -not (Test-Path -LiteralPath $catalog)) {
    throw "The package directory must contain the INF, DLL, and catalog files."
}

if ($TestCertificatePath) {
    $certificate = (Resolve-Path -LiteralPath $TestCertificatePath).Path
    Import-Certificate -FilePath $certificate -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
    Import-Certificate -FilePath $certificate -CertStoreLocation Cert:\LocalMachine\TrustedPublisher | Out-Null
}

& pnputil.exe /add-driver $inf /install
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}