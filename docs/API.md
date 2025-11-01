## API Documentation

### Go Backend Endpoints

- `GET /health` - Health check
- `POST /scan` - Start directory scan
- `GET /scan/{id}/status` - Get scan status
- `GET /applications` - Get installed applications
- `GET /configurations` - Get configuration files
- `POST/DELETE /exclusions` - Manage scan exclusions
- `POST /shutdown` - Graceful shutdown