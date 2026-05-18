<?php

use App\Http\Controllers\Api\Admin\BlockedIpController;
use App\Http\Controllers\Api\Admin\VisitorController;
use App\Http\Controllers\Api\DashboardVisitorController;
use App\Http\Controllers\Api\GurbaniApiController;
use App\Http\Controllers\Api\SpeechTokenController;
use App\Http\Controllers\Gurbani\GurbaniController;
use App\Http\Controllers\GurbaniNavigatorController;
use App\Http\Controllers\GurbaniSyncController;
use App\Http\Controllers\Learn\Punjabi\HomeController;
use App\Http\Controllers\Learn\Punjabi\ReadPunjabiController;
use App\Http\Controllers\Listen\GurbaniListenController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('home');
})->name('home');

Route::get('/search', [GurbaniController::class, 'search'])->name('search');
Route::get('/shabad/{id}', [GurbaniController::class, 'shabad'])->name('shabad');
Route::get('/sync/{keyName}', GurbaniSyncController::class);

Route::middleware(['auth', 'role:user|admin', 'verified'])->group(function() {
    Route::get('dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard');

    Route::get('gurbani-navigator', [GurbaniNavigatorController::class, 'index'])->name('gurbani.navigator');

    Route::get('/speech/tokens', [SpeechTokenController::class, 'index'])->name('speech.tokens.list');
    Route::get('/shabads/{shabadId}', [GurbaniApiController::class, 'showShabad']);
    Route::post('/panktis', [GurbaniApiController::class, 'getPanktis']);
});

Route::middleware(['auth', 'role:admin', 'verified'])->group(function() {
    Route::get('/admin/speech-tokens/sessions', [SpeechTokenController::class, 'sessions'])->name('speech.tokens.sessions');
    Route::get('/admin/speech-tokens/session/{sessionId}', [SpeechTokenController::class, 'getSessionLogs'])->name('speech.tokens.session.logs');
});

Route::middleware(['auth', 'role:admin', 'verified'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function () {
    Route::get('dashboard', function () {
        return Inertia::render('admin/dashboard');
    })->name('dashboard');

    Route::get('/api/dashboard-visitors', [DashboardVisitorController::class, 'index']);
    Route::get('/api/visitors', [VisitorController::class, 'index']);
    Route::apiResource('api/blocked-ips', BlockedIpController::class);

    Route::get('/visitors', function () {
        return Inertia::render('admin/visitors');
    })->name('visitors');

    Route::get('/block-ips', function () {
        return Inertia::render('admin/blockIps');
    })->name('blockIps');
});

Route::get('/listen', [GurbaniListenController::class, 'index']);

Route::get('/learn/punjabi', HomeController::class)->name('learn.punjabi.home');
Route::get('/learn/punjabi/reading', [ReadPunjabiController::class, 'index'])->name('learn.punjabi.read');
Route::get('/learn/punjabi/reading/alphabets', [ReadPunjabiController::class, 'alphabets'])->name('learn.punjabi.read');

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
