import pymysql

# Django's MySQL backend checks mysqlclient version. When using PyMySQL,
# provide compatible version metadata to satisfy that check.
pymysql.version_info = (2, 2, 1, "final", 0)
pymysql.__version__ = "2.2.1"
pymysql.install_as_MySQLdb()