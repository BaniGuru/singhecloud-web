<?php

use App\Http\Controllers\Api\BaniStreamController;
use App\Http\Controllers\Api\GurbaniApiController;
use App\Http\Controllers\Api\SpeechTokenController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Shetabit\Visitor\Middlewares\LogVisits;

Route::middleware([LogVisits::class])->group(function () {
    Route::get('/gurbani/angs/{ang}', [GurbaniApiController::class, 'getByAng']);
    Route::get('/gurbani/search', [GurbaniApiController::class, 'search']);
    Route::get('/gurbani/shabad/{id}', [GurbaniApiController::class, 'shabad']);
    Route::get('/bani-stream/{name}', [BaniStreamController::class, 'validateName']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/turn-credentials', function () {
        $secret = config('services.turn.secret');

        $expiry = time() + 3600; // 1 hour

        $username = (string) $expiry;

        $credential = base64_encode(
            hash_hmac('sha1', $username, $secret, true)
        );

        return response()->json([
            'iceServers' => [
                [
                    'urls' => [
                        'stun:stun.cloudflare.com:3478',
                        'stun:stun.l.google.com:19302',
                        'stun:global.stun.twilio.com:3478',
                    ],
                ],
                [
                    'urls' => [
                        'turn:baniguru.com:3478?transport=udp',
                        'turn:baniguru.com:3478?transport=tcp',
                    ],
                    'username' => $username,
                    'credential' => $credential,
                ],
            ],
            // "all" = allow STUN/direct + TURN fallback
            // "relay" = force TURN only
            'iceTransportPolicy' => 'all',
        ]);
    });

    Route::get('/user', function(Request $request) {
        $user = $request->user();

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'bani-stream-name' => $user->baniStreamKey?->name,
        ]);
    });

    Route::post('/speech/token', [SpeechTokenController::class, 'store'])->name('speech.tokens.create');
});