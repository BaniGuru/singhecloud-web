<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;

class GurbaniNavigatorController extends Controller
{
    public function index()
    {
        return Inertia::render('gurbani/navigator', [
            'appId' => config('app.app_id'),
            'wssServer' => config('app.wss_server'),
        ]);
    }
}
