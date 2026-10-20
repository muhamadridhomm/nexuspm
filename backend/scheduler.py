import random
import copy
from typing import List, Dict, Any, Tuple
from datetime import datetime, timedelta

def run_cpm(issues: List[Dict[str, Any]]) -> Tuple[Dict[str, Dict[str, int]], str]:
    """
    Computes Critical Path Method (CPM) for the issues.
    Returns:
        - A dict containing ES, EF, LS, LF, and slack for each issue.
        - The ID of the project that ends last under CPM (has the maximum Early Finish).
    """
    # Create graphs
    nodes = {iss["id"]: iss for iss in issues}
    adj = {iss["id"]: [] for iss in issues}
    rev_adj = {iss["id"]: [] for iss in issues}
    in_degree = {iss["id"]: 0 for iss in issues}
    
    for iss in issues:
        preds = iss.get("predecessors", [])
        for pred in preds:
            if pred in nodes:
                adj[pred].append(iss["id"])
                rev_adj[iss["id"]].append(pred)
                in_degree[iss["id"]] += 1
                
    # Topological sort for Forward Pass
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    topo_order = []
    
    while queue:
        u = queue.pop(0)
        topo_order.append(u)
        for v in adj[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)
                
    # Forward Pass (ES & EF)
    es = {nid: 0 for nid in nodes}
    ef = {nid: nodes[nid]["duration"] for nid in nodes}
    
    for u in topo_order:
        for v in adj[u]:
            if es[v] < ef[u]:
                es[v] = ef[u]
                ef[v] = es[v] + nodes[v]["duration"]
                
    # Identify Project Ending Last under CPM
    max_ef = -1
    project_ends = {} # projectId -> max_ef
    for nid, iss in nodes.items():
        pid = iss.get("projectId")
        if pid:
            project_ends[pid] = max(project_ends.get(pid, -1), ef[nid])
            
    project_ending_last = ""
    if project_ends:
        project_ending_last = max(project_ends, key=project_ends.get)
        
    # Backward Pass (LS & LF)
    max_project_ef = max(ef.values()) if ef else 0
    lf = {nid: max_project_ef for nid in nodes}
    ls = {nid: max_project_ef - nodes[nid]["duration"] for nid in nodes}
    
    # Reverse topological order for backward pass
    for u in reversed(topo_order):
        if not adj[u]: # Sink node
            lf[u] = max_project_ef
            ls[u] = lf[u] - nodes[u]["duration"]
        else:
            min_ls_v = min(ls[v] for v in adj[u])
            lf[u] = min_ls_v
            ls[u] = lf[u] - nodes[u]["duration"]
            
    # Calculate Slack
    cpm_results = {}
    for nid in nodes:
        slack = ls[nid] - es[nid]
        cpm_results[nid] = {
            "es": es[nid],
            "ef": ef[nid],
            "ls": ls[nid],
            "lf": lf[nid],
            "slack": max(0, slack)
        }
        
    return cpm_results, project_ending_last

def solve_rcmpsp_drawers(
    issues: List[Dict[str, Any]],
    resources: List[Dict[str, Any]],
    requirements: List[Dict[str, Any]],
    simulations: int = 100
) -> Dict[str, Any]:
    """
    Solves the RCMPSP using a Parallel Schedule Generation Scheme (P-SGS)
    enhanced by the Drawers Heuristic.
    """
    if not issues:
        return {"tms": 0, "auf": 0.0, "schedule": {}}
        
    # Build maps
    nodes = {iss["id"]: iss for iss in issues}
    req_map = {iss["id"]: {} for iss in issues}
    for req in requirements:
        req_map[req["issueId"]][req["resourceId"]] = req["quantity"]
        
    # Run CPM to compute slack and find project ending last
    cpm_results, project_ending_last = run_cpm(issues)
    
    best_tms = float('inf')
    best_schedule = {}
    
    # Run multiple simulations to find the optimal makespan
    for sim_idx in range(simulations):
        # Local copies of status tracking
        remaining_tasks = set(nodes.keys())
        completed_tasks = set()
        ongoing_tasks = [] # list of (task_id, start_time, end_time)
        
        task_start = {}
        task_end = {}
        
        t = 0
        
        while remaining_tasks or ongoing_tasks:
            # 1. Update ongoing tasks and free resources
            finished = []
            for item in ongoing_tasks:
                task_id, start_t, end_t = item
                if end_t <= t:
                    finished.append(item)
                    completed_tasks.add(task_id)
            for item in finished:
                ongoing_tasks.remove(item)
                
            # Compute current resource usage
            resource_usage = {res["id"]: 0 for res in resources}
            for task_id, start_t, end_t in ongoing_tasks:
                for res_id, qty in req_map[task_id].items():
                    if res_id in resource_usage:
                        resource_usage[res_id] += qty
                        
            # 2. Identify candidate tasks
            candidates = []
            for task_id in remaining_tasks:
                # Predecessors must be complete
                preds = nodes[task_id].get("predecessors", [])
                if all(pred in completed_tasks for pred in preds):
                    candidates.append(task_id)
                    
            # 3. Categorize candidates into Drawers
            drawer_1 = [] # Portfolio Critical Path (Slack = 0 & belongs to project ending last)
            drawer_2 = [] # Project Critical Path (Slack = 0)
            drawer_3 = [] # Non-critical tasks of the project ending last
            drawer_4 = [] # All remaining tasks
            
            for cid in candidates:
                slack = cpm_results[cid]["slack"]
                pid = nodes[cid].get("projectId")
                
                is_critical = (slack == 0)
                is_ending_last = (pid == project_ending_last)
                
                if is_critical and is_ending_last:
                    drawer_1.append(cid)
                elif is_critical:
                    drawer_2.append(cid)
                elif is_ending_last:
                    drawer_3.append(cid)
                else:
                    drawer_4.append(cid)
                    
            # Shuffle within drawers for randomization in tie breaks
            random.shuffle(drawer_1)
            random.shuffle(drawer_2)
            random.shuffle(drawer_3)
            random.shuffle(drawer_4)
            
            ordered_candidates = drawer_1 + drawer_2 + drawer_3 + drawer_4
            
            # 4. Schedule tasks under resource constraints
            for cid in ordered_candidates:
                # Check resource capacity
                fits = True
                task_reqs = req_map[cid]
                for res in resources:
                    res_id = res["id"]
                    qty_needed = task_reqs.get(res_id, 0)
                    capacity = res["capacity"]
                    current_use = resource_usage[res_id]
                    
                    # Local resource scope check
                    if res.get("projectId") and res["projectId"] != nodes[cid].get("projectId"):
                        continue
                        
                    if current_use + qty_needed > capacity:
                        fits = False
                        break
                        
                if fits:
                    # Allocate resources
                    for res_id, qty in task_reqs.items():
                        if res_id in resource_usage:
                            resource_usage[res_id] += qty
                            
                    duration = nodes[cid]["duration"]
                    task_start[cid] = t
                    task_end[cid] = t + duration
                    ongoing_tasks.append((cid, t, t + duration))
                    remaining_tasks.remove(cid)
                    
            # 5. Increment time to next event
            if ongoing_tasks:
                t = min(end_t for task_id, start_t, end_t in ongoing_tasks)
            else:
                if remaining_tasks:
                    # Circular dependency or block, break loop
                    break
                    
        # Calculate TMS for this simulation
        tms = max(task_end.values()) if task_end else 0
        if tms < best_tms:
            best_tms = tms
            best_schedule = {
                tid: {"start": task_start[tid], "end": task_end[tid]} for tid in task_start
            }
            
    # Calculate Average Utilization Factor (AUF)
    # AUF = sum(resource_requirement * duration) / sum(resource_capacity * TMS)
    total_resource_hours = 0
    total_capacity_hours = 0
    
    if best_tms > 0:
        for res in resources:
            res_id = res["id"]
            capacity = res["capacity"]
            total_capacity_hours += capacity * best_tms
            
            # Sum up requirements for this resource across all tasks scheduled
            for tid, sched in best_schedule.items():
                duration = nodes[tid]["duration"]
                qty = req_map[tid].get(res_id, 0)
                
                # Filter local resource scope
                if res.get("projectId") and res["projectId"] != nodes[tid].get("projectId"):
                    continue
                total_resource_hours += qty * duration
                
    auf = (total_resource_hours / total_capacity_hours) if total_capacity_hours > 0 else 0.0
    
    return {
        "tms": best_tms,
        "auf": round(auf, 3),
        "schedule": best_schedule
    }
