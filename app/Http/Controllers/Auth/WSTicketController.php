<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class WSTicketController extends Controller
{
    public function generate()
    {
        $user = auth()->user();

        $ticket = Str::random(64);

        Cache::put("ws-ticket:$ticket", [
            'user_id' => $user->id,
            'name' => $user->name,
        ], now()->addSeconds(30));

        return response()->json([
            'ticket' => $ticket,
        ]);
    }

    public function validate(Request $request)
    {
        $secret = $request->header('X-Internal-Secret');

        if ($secret !== config('app.ws_internal_secret')) {
            abort(403);
        }

        $ticket = $request->input('ticket');

        if (!$ticket) {
            return response()->json(['ok' => false], 422);
        }

        $user = Cache::pull("ws-ticket:$ticket");

        if (!$user) {
            return response()->json(['ok' => false], 401);
        }

        return response()->json([
            'id' => $user['user_id'],
            'name' => $user['name'],
        ]);
    }
}
