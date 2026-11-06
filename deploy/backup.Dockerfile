# Daily PostgreSQL backup (SDD-012). Build from the repository root:  docker build -f deploy/backup.Dockerfile -t jobradar-backup .
FROM postgres:16
COPY deploy/backup.sh deploy/restore.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh
ENTRYPOINT ["backup.sh"]
