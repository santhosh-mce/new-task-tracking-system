import os
import json
from datetime import datetime, date, time
from decimal import Decimal
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))

def default_serializer(obj):
    if isinstance(obj, (datetime, date, time)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, bytes):
        return obj.hex()
    raise TypeError(f"Type {type(obj)} not serializable")

backup_data = {
    "backup_timestamp": datetime.utcnow().isoformat(),
    "database_name": "task_tracking_db",
    "tables": {}
}

backup_dir = os.path.join(os.path.dirname(__file__), "backups")
os.makedirs(backup_dir, exist_ok=True)
timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_file = os.path.join(backup_dir, f"backup_pre_employee_deletion_{timestamp_str}.json")

with engine.connect() as conn:
    tables = conn.execute(text("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)).fetchall()
    
    for t in tables:
        t_name = t[0]
        rows = conn.execute(text(f"SELECT * FROM {t_name}")).fetchall()
        # get column names
        cols = conn.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{t_name}' ORDER BY ordinal_position")).fetchall()
        col_names = [c[0] for c in cols]
        
        table_rows = []
        for r in rows:
            row_dict = {}
            for col, val in zip(col_names, r):
                row_dict[col] = val
            table_rows.append(row_dict)
            
        backup_data["tables"][t_name] = table_rows
        print(f"Backed up table '{t_name}': {len(table_rows)} rows")

with open(backup_file, "w", encoding="utf-8") as f:
    json.dump(backup_data, f, indent=2, default=default_serializer)

print(f"\nSuccessfully created database backup: {backup_file}")
