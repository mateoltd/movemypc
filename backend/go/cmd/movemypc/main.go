package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/mateoltd/movemypc/backend/go/pkg/analyzers"
	"github.com/mateoltd/movemypc/backend/go/pkg/scan"
)

const (
	defaultPort = "31337"
	serverTimeout = 30 * time.Second
)

type Server struct {
	mux           *http.ServeMux
	scanJobs      map[string]*ScanJob
	scanJobsMutex sync.RWMutex
	exclusions    scan.ExclusionManager
}

type ScanJob struct {
	ID        string
	Status    string // "running", "completed", "failed"
	Items     []scan.FileItem
	Errors    []string
	Progress  scan.AnalysisProgress
	Completed bool
	Created   time.Time
	mutex     sync.RWMutex
}

func NewServer() *Server {
	s := &Server{
		mux:        http.NewServeMux(),
		scanJobs:   make(map[string]*ScanJob),
		exclusions: scan.NewSimpleExclusionManager(),
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.mux.HandleFunc("/health", s.healthHandler)
	s.mux.HandleFunc("/scan", s.scanHandler)
	s.mux.HandleFunc("/scan/", s.scanStatusHandler)
	s.mux.HandleFunc("/applications", s.applicationsHandler)
	s.mux.HandleFunc("/configurations", s.configurationsHandler)
	s.mux.HandleFunc("/exclusions", s.getExclusionsHandler)
	s.mux.HandleFunc("/exclusions/add", s.addExclusionHandler)
	s.mux.HandleFunc("/exclusions/remove", s.removeExclusionHandler)
	s.mux.HandleFunc("/shutdown", s.shutdownHandler)
}

type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Version   string    `json:"version"`
}

func (s *Server) healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	response := HealthResponse{
		Status:    "ok",
		Timestamp: time.Now().UTC(),
		Version:   "1.0.0", // TODO: Make this dynamic from build info
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode health response: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

func (s *Server) scanHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req scan.ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Generate job ID
	jobID := generateJobID()

	// Create scan job
	job := &ScanJob{
		ID:        jobID,
		Status:    "running",
		Items:     []scan.FileItem{},
		Errors:    []string{},
		Progress:  scan.AnalysisProgress{},
		Completed: false,
		Created:   time.Now(),
	}

	// Store job
	s.scanJobsMutex.Lock()
	s.scanJobs[jobID] = job
	s.scanJobsMutex.Unlock()

	// Start scan in background
	go s.performScan(job, req)

	response := map[string]string{"jobId": jobID}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) scanStatusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract job ID from URL path
	path := r.URL.Path
	if !strings.HasPrefix(path, "/scan/") {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	jobID := strings.TrimPrefix(path, "/scan/")
	if jobID == "" {
		http.Error(w, "Job ID required", http.StatusBadRequest)
		return
	}

	s.scanJobsMutex.RLock()
	job, exists := s.scanJobs[jobID]
	s.scanJobsMutex.RUnlock()

	if !exists {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	job.mutex.RLock()
	response := map[string]interface{}{
		"jobId":     job.ID,
		"status":    job.Status,
		"completed": job.Completed,
		"items":     job.Items,
		"errors":    job.Errors,
		"progress":  job.Progress,
	}
	job.mutex.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) applicationsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Create analyzer
	limits := scan.AnalysisLimits{
		MaxDepth:               3,
		BatchSize:              10,
		ProgressUpdateInterval: 100,
		LargeSizeThreshold:     1024 * 1024 * 1024,
		WarningDirectorySize:   1000,
		SlowDirectoryThreshold: 5000,
		ConcurrencyLevel:       4,
	}

	analyzer := analyzers.NewApplicationsAnalyzer(limits, nil)

	// Perform analysis
	ctx := context.Background()
	apps, err := analyzer.AnalyzeApplications(ctx)

	response := map[string]interface{}{
		"items": apps,
	}

	if err != nil {
		response["error"] = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) configurationsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Create analyzer
	limits := scan.AnalysisLimits{
		MaxDepth:               3,
		BatchSize:              10,
		ProgressUpdateInterval: 100,
		LargeSizeThreshold:     1024 * 1024 * 1024,
		WarningDirectorySize:   1000,
		SlowDirectoryThreshold: 5000,
		ConcurrencyLevel:       4,
	}

	analyzer := analyzers.NewConfigurationsAnalyzer(limits, nil)

	// Perform analysis
	ctx := context.Background()
	configs, err := analyzer.AnalyzeConfigurations(ctx)

	response := map[string]interface{}{
		"items": configs,
	}

	if err != nil {
		response["error"] = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) getExclusionsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	exclusions := s.exclusions.GetExclusions()
	response := map[string]interface{}{
		"exclusions": exclusions,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) addExclusionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}

	s.exclusions.AddExclusion(req.Path)

	response := map[string]string{"status": "ok"}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) removeExclusionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}

	s.exclusions.RemoveExclusion(req.Path)

	response := map[string]string{"status": "ok"}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) shutdownHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("Shutdown requested via HTTP")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"shutting_down"}`))

	// Trigger shutdown
	go func() {
		time.Sleep(100 * time.Millisecond) // Give time for response
		os.Exit(0)
	}()
}

func (s *Server) performScan(job *ScanJob, req scan.ScanRequest) {
	defer func() {
		job.mutex.Lock()
		job.Completed = true
		if len(job.Errors) > 0 {
			job.Status = "failed"
		} else {
			job.Status = "completed"
		}
		job.mutex.Unlock()
	}()

	// Create progress channel
	progressCh := make(chan scan.AnalysisProgress, 10)

	// Start progress updater
	go func() {
		for progress := range progressCh {
			job.mutex.Lock()
			job.Progress = progress
			job.mutex.Unlock()
		}
	}()

	// Create scanner
	scanner := scan.NewScanner(nil, req.Limits, progressCh)

	// Perform scan
	ctx := context.Background()
	result, err := scanner.ScanDirectory(ctx, req)

	// Close progress channel to signal completion
	close(progressCh)

	job.mutex.Lock()
	if err != nil {
		job.Errors = append(job.Errors, err.Error())
		job.Status = "failed"
	} else {
		job.Items = result.Items
		job.Status = "completed"
	}
	job.mutex.Unlock()
}

func generateJobID() string {
	return fmt.Sprintf("job-%d", time.Now().UnixNano())
}

func startServer(port string) *http.Server {
	server := &Server{}
	server.setupRoutes()

	httpServer := &http.Server{
		Addr:         ":" + port,
		Handler:      server.mux,
		ReadTimeout:  serverTimeout,
		WriteTimeout: serverTimeout,
		IdleTimeout:  serverTimeout,
	}

	go func() {
		log.Printf("Starting MoveMyPC backend server on %s", httpServer.Addr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed to start: %v", err)
		}
	}()

	return httpServer
}

func waitForShutdown(server *http.Server) {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	log.Println("Received shutdown signal, shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	} else {
		log.Println("Server gracefully stopped")
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	server := startServer(port)
	waitForShutdown(server)
}
