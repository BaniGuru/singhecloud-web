import { useEffect, useState } from 'react';
import axios from 'axios';

import AdminAppLayout from '@/layouts/admin-app-layout';
import { dashboard } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { visitors } from '@/routes/admin';

import {
  DataGrid,
  GridColDef,
  GridSortModel,
  GridPaginationModel,
} from '@mui/x-data-grid';
import {
  TextField,
  Select,
  MenuItem,
  Button,
  Box,
  FormControlLabel,
  Switch,
} from '@mui/material';

type Visitor = {
  id: number;
  visitor_id: string;
  ip: string;
  browser: string;
  platform: string;
  device: string;
  country?: string;
  city?: string;
  useragent: string;
  url: string;
  visited_at: string;
};

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Dashboard', href: '/admin/dashboard' },
  { title: 'Visitors', href: visitors().url },
];

export default function VisitorsPage() {
  const [rows, setRows] = useState<Visitor[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(0); // 0-based for DataGrid
  const [pageSize, setPageSize] = useState(25);

  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: 'id', sort: 'desc' },
  ]);

  const [filters, setFilters] = useState({
    ip: '',
    visitor_id: '',
    useragent: '',
    browser: '',
    platform: '',
    device: '',
    country: '',
    city: '',
    url: '',
    exclude_admin: false,
  });

  const fetchVisitors = async () => {
    setLoading(true);
    try {
      const sort = sortModel[0] ?? { field: 'visited_at', sort: 'desc' };

      const { data } = await axios.get('/admin/api/visitors', {
        params: {
          page: page + 1, // API is 1-based
          perPage: pageSize,
          sort: sort.field,
          order: sort.sort?.toUpperCase(),
          ...filters,
        },
        withCredentials: true,
      });

      setRows(data.data || []);
      setRowCount(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Refetch whenever page, pageSize, sort, or filters change
  useEffect(() => {
    fetchVisitors();
  }, [page, pageSize, sortModel, filters]);

  const setFilter = (key: string, value: any) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'visitor_id', headerName: 'Visitor ID', width: 140 },
    { field: 'ip', headerName: 'IP', width: 140 },
    { field: 'url', headerName: 'URL', width: 400 },
    { field: 'visited_at', headerName: 'Visited At', width: 250 },
    { field: 'browser', headerName: 'Browser', width: 120 },
    { field: 'platform', headerName: 'Platform', width: 120 },
    { field: 'device', headerName: 'Device', width: 110 },
    { field: 'country', headerName: 'Country', width: 110 },
    { field: 'city', headerName: 'City', width: 120 },
    { field: 'useragent', headerName: 'User Agent', width: 460 },
  ];

  return (
    <AdminAppLayout breadcrumbs={breadcrumbs}>
      <Head title="Visitors" />

      <Box className="flex flex-col gap-4 p-4">
        {/* ---------------- Filters ---------------- */}
        <Box display="flex" gap={2} flexWrap="wrap" mb={2}>
          <TextField
            label="IP"
            size="small"
            value={filters.ip}
            onChange={(e) => setFilter('ip', e.target.value)}
          />
          <TextField
            label="Visitor ID"
            size="small"
            value={filters.visitor_id}
            onChange={(e) => setFilter('visitor_id', e.target.value)}
          />
          <TextField
            label="User Agent"
            size="small"
            value={filters.useragent}
            onChange={(e) => setFilter('useragent', e.target.value)}
          />
          <TextField
            label="URL"
            size="small"
            value={filters.url}
            onChange={(e) => setFilter('url', e.target.value)}
          />

          <Select
            size="small"
            displayEmpty
            value={filters.browser}
            onChange={(e) => setFilter('browser', e.target.value)}
          >
            <MenuItem value="">Browser</MenuItem>
            <MenuItem value="Chrome">Chrome</MenuItem>
            <MenuItem value="Firefox">Firefox</MenuItem>
            <MenuItem value="Safari">Safari</MenuItem>
            <MenuItem value="Edge">Edge</MenuItem>
            <MenuItem value="Opera">Opera</MenuItem>
          </Select>

          <Select
            size="small"
            displayEmpty
            value={filters.platform}
            onChange={(e) => setFilter('platform', e.target.value)}
          >
            <MenuItem value="">Platform</MenuItem>
            <MenuItem value="Windows">Windows</MenuItem>
            <MenuItem value="Mac">Mac</MenuItem>
            <MenuItem value="Linux">Linux</MenuItem>
            <MenuItem value="Android">Android</MenuItem>
            <MenuItem value="iOS">iOS</MenuItem>
          </Select>

          <FormControlLabel
            control={
              <Switch
                checked={filters.exclude_admin}
                onChange={(e) => setFilter('exclude_admin', e.target.checked)}
              />
            }
            label="Exclude Admin URLs"
          />

          <Button
            variant="contained"
            onClick={() => setPage(0)} // triggers useEffect to refetch
          >
            Apply
          </Button>
        </Box>

        {/* ---------------- Data Grid ---------------- */}
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          rowCount={rowCount}
          pagination
          paginationMode="server"
          sortingMode="server"
          pageSizeOptions={[25, 50, 100]}
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model: GridPaginationModel) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          onSortModelChange={setSortModel}
          autoHeight
        />
      </Box>
    </AdminAppLayout>
  );
}
