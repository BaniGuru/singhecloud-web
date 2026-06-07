<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GurbaniApiController
{
    public function getByAng($ang)
    {
        // Ensure ang is within valid range
        if ($ang < 1 || $ang > 190) {
            return;
        }

        $panktis = DB::select(
            "SELECT
                l.id,
                l.gurmukhi,
                t.translation,
                t.additional_information,
                source_page,
                at.line_start_time AS start_time,
                at.line_end_time   AS end_time
            FROM audio_transcriptions at
            INNER JOIN lines l ON l.id = at.line_id
            LEFT JOIN translations t
                ON t.line_id = l.id
               AND t.translation_source_id = 6
            WHERE source_page = ?
            ORDER BY l.order_id ASC",
            [$ang]
        );

        return [
            'ang' => $ang,
            'panktis' => $panktis,
        ];
    }

    public function search(Request $request)
    {
        $request->merge([
            'q' => trim($request->q),
        ]);

        $validated = $request->validate([
            'q' => ['required', 'string', 'min:2'],
            'type' => ['required', 'string', 'in:words,first_letters']
        ]);

        if ($validated['type'] === 'first_letters') {
            $panktis = DB::select(
                "SELECT id, gurmukhi, shabad_id
                FROM lines
                WHERE first_letters LIKE ? AND type_id > 2
                LIMIT 50",
                ['%' . $validated['q'] . '%']
            );
        } else {
            $panktis = DB::select(
                "SELECT id, gurmukhi, shabad_id
                FROM lines
                WHERE gurmukhi LIKE ? AND type_id > 2
                ORDER BY order_id",
                ['%' . $validated['q'] . '%']
            );
        }

        return response()->json($panktis);
    }

    public function shabad(string $shabadId)
    {
        if (empty($shabadId)) {
            return response()->json([
                'panktis' => [],
            ]);
        }

        // Get current shabad order_id
        $currentShabad = DB::table('shabads')
            ->select('id', 'order_id')
            ->where('id', $shabadId)
            ->first();

        if (!$currentShabad) {
            return response()->json([
                'panktis' => [],
                'prev_shabad_id' => null,
                'next_shabad_id' => null,
            ]);
        }

        // Previous shabad
        $prevShabad = DB::table('shabads')
            ->select('id')
            ->where('order_id', '<', $currentShabad->order_id)
            ->orderBy('order_id', 'desc')
            ->first();

        // Next shabad
        $nextShabad = DB::table('shabads')
            ->select('id')
            ->where('order_id', '>', $currentShabad->order_id)
            ->orderBy('order_id', 'asc')
            ->first();

        $panktis = DB::select(
            "SELECT
                lines.id,
                lines.gurmukhi,
                punjabi.translation as punjabi_translation,
                english.translation as english_translation
                From lines
                INNER JOIN shabads ON (lines.shabad_id = shabads.id)
                LEFT JOIN translations AS punjabi ON lines.id = punjabi.line_id AND (
                    (shabads.source_id = 1 AND punjabi.translation_source_id = 6) OR
                    (shabads.source_id != 1 AND punjabi.translation_source_id IN (8, 11, 13, 15, 17, 19, 21))
                )
                LEFT JOIN translations AS english ON lines.id = english.line_id AND (
                    (shabads.source_id = 1 AND english.translation_source_id = 1) OR
                    (shabads.source_id != 1 AND english.translation_source_id IN (7, 9, 10, 12, 14, 16, 18, 20, 22))
                )
                WHERE lines.shabad_id = ?
                ORDER BY lines.order_id ASC
            ",
            [$shabadId]
        );

        return response()->json([
            'panktis' => $panktis,
            'prev_shabad_id' => $prevShabad->id ?? null,
            'next_shabad_id' => $nextShabad->id ?? null,
        ]);
    }

    public function bani(string $baniId)
    {
        $panktis = DB::select(
            "SELECT
                lines.id,
                lines.gurmukhi,
                punjabi.translation as punjabi_translation,
                english.translation as english_translation
                From bani_lines
                INNER JOIN lines ON bani_lines.line_id = lines.id
                INNER JOIN shabads ON (lines.shabad_id = shabads.id)
                LEFT JOIN translations AS punjabi ON lines.id = punjabi.line_id AND (
                    (shabads.source_id = 1 AND punjabi.translation_source_id = 6) OR
                    (shabads.source_id != 1 AND punjabi.translation_source_id IN (8, 11, 13, 15, 17, 19, 21))
                )
                LEFT JOIN translations AS english ON lines.id = english.line_id AND (
                    (shabads.source_id = 1 AND english.translation_source_id = 1) OR
                    (shabads.source_id != 1 AND english.translation_source_id IN (7, 9, 10, 12, 14, 16, 18, 20, 22))
                )
                WHERE bani_lines.bani_id = ?
                ORDER BY bani_lines.line_group, lines.order_id ASC
            ",
            [$baniId]
        );

        return response()->json([
            'panktis' => $panktis,
            'prev_shabad_id' => null,
            'next_shabad_id' => null,
        ]);
    }

    public function showShabad($shabadId)
    {
        $panktis = DB::select(
            "SELECT
                l.id,
                l.gurmukhi,
                t.translation
                source_page
            From lines l
            LEFT JOIN translations t
                ON t.line_id = l.id
               AND t.translation_source_id = 6
            WHERE l.shabad_id = ?
            ORDER BY l.order_id ASC",
            [$shabadId]
        );

        return response()->json([
            'panktis' => $panktis,
        ]);
    }

    public function getPanktis(Request $request)
    {
        $validated = $request->validate([
            'lines' => 'required|array',
            'lines.*' => 'string',
        ]);

        $lineIds = $validated['lines'];

        if (empty($lineIds)) {
            return response()->json([]);
        }

        $panktis = DB::table('lines as l')
            ->leftJoin('translations as t', function ($join) {
                $join->on('t.line_id', '=', 'l.id')
                    ->where('t.translation_source_id', 6);
            })
            ->whereIn('l.id', $lineIds)
            ->select('l.id', 'l.gurmukhi', 't.translation', 'l.source_page')
            ->get()
            ->keyBy('id');

        $ordered = collect($lineIds)
            ->map(fn ($id) => $panktis->get($id))
            ->filter()
            ->values();

        return response()->json($ordered);
    }
}
