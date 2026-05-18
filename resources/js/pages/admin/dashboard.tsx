import { useEffect, useState, useRef } from 'react';
import axios from 'axios';

import { dashboard } from '@/routes/admin/index';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import * as d3 from 'd3';
import { feature } from 'topojson-client';
import HeatMap from '@uiw/react-heat-map';
import AdminAppLayout from '@/layouts/admin-app-layout';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626'];

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: dashboard().url },
];

type DashboardData = {
  total_visits: number;
  unique_visitors: number;
  unique_this_week: number;
  unique_this_month: number;
  unique_this_year: number;
  area_chart: { date: string; visitors: number }[];
  devices: { name: string; value: number }[];
  browsers: { name: string; value: number }[];
  countries: { country: string; value: number }[];
  heatmap: { date: string; count: number }[];
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    axios.get<DashboardData>('/admin/api/dashboard-visitors').then((r) => {
      setData(r.data);
    });
  }, []);

  if (!data) return null;

  return (
    <AdminAppLayout breadcrumbs={breadcrumbs}>
      <Head title="Dashboard" />

      <div className="flex flex-col gap-4 p-4">
        {/* Tiles */}
        <div className="grid md:grid-cols-5 gap-4">
          <Tile title="Total Visits" value={data.total_visits} />
          <Tile title="Unique Visitors" value={data.unique_visitors} />
          <Tile title="This Week" value={data.unique_this_week} />
          <Tile title="This Month" value={data.unique_this_month} />
          <Tile title="This Year" value={data.unique_this_year} />
        </div>

        {/* Area Chart */}
        <Card title="Visitors (Last 14 Days)">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.area_chart}>
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Area dataKey="visitors" stroke="#2563eb" fill="#93c5fd" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Pie Charts */}
        <div className="grid md:grid-cols-2 gap-4">
          <PieBlock title="Devices" data={data.devices} />
          <PieBlock title="Browsers" data={data.browsers} />
        </div>

        {/* D3 World Map */}
        <Card title="Visitors by Country">
          <WorldMap countries={data.countries} />
        </Card>

        {/* Heatmap */}
        <Card title="Daily Activity">
          <HeatMap
            value={data.heatmap}
            width={800}
            rectSize={12}
            startDate={new Date(new Date().getFullYear(), 0, 1)}
          />
        </Card>
      </div>
    </AdminAppLayout>
  );
}

function Tile({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-3xl font-semibold">{value}</div>
    </div>
  );
}

function Card({ title, children }: any) {
  return (
    <div className="rounded-xl border p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function PieBlock({
  title,
  data = [],
}: {
  title: string;
  data?: { name: string; value: number }[];
}) {
  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" label>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

function WorldMap({ countries = [] }: { countries?: { country: string; value: number }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 800;
    const height = 400;

    const projection = d3
      .geoMercator()
      .scale(130)
      .translate([width / 2, height / 1.4]);

    const path = d3.geoPath().projection(projection);

    const countryMap = Object.fromEntries(countries.map((c) => [c.country, c.value]));

    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then((res) => res.json())
      .then((world) => {
        const countriesData = feature(world, world.objects.countries).features;

        svg
          .attr('viewBox', `0 0 ${width} ${height}`)
          .selectAll('path')
          .data(countriesData)
          .enter()
          .append('path')
          .attr('d', path as any)
          .attr('fill', (d: any) =>
            countryMap[d.properties.ISO_A2] ? '#2563eb' : '#e5e7eb'
          )
          .attr('stroke', '#fff')
          .append('title')
          .text((d: any) => `${d.properties.NAME}: ${countryMap[d.properties.ISO_A2] || 0}`);
      });
  }, [countries]);

  return <svg ref={svgRef} className="w-full h-[400px]" />;
}
